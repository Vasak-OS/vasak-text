<script lang="ts" setup>
/**
 * El editor: una vista de CodeMirror y **un estado por pestaña**.
 *
 * Ésa es la decisión que importa acá. Lo fácil sería reemplazar el contenido de
 * la vista al cambiar de pestaña, y funciona hasta que alguien vuelve a la
 * pestaña anterior y aprieta deshacer: el historial es parte del estado, así que
 * un solo estado compartido significa que el deshacer de un archivo deshace en
 * el otro. Guardando un `EditorState` por pestaña, cada archivo conserva su
 * historial, su selección y su posición de scroll.
 *
 * La vista es una sola porque montar quince editores es montar quince veces el
 * mismo aparato, y en un WebView eso se nota.
 */

import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	redo,
	undo,
} from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import {
	gotoLine,
	highlightSelectionMatches,
	openSearchPanel,
	search,
	searchKeymap,
} from '@codemirror/search';
import { Compartment, EditorState, type Extension, Prec, StateField } from '@codemirror/state';
import {
	drawSelection,
	dropCursor,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
	rectangularSelection,
} from '@codemirror/view';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as lenguajes from '@/tools/lenguajes';
import { tema } from '@/tools/tema';

const props = defineProps<{
	/** Cuál pestaña se está mostrando. */
	pestanaId: string | null;
	/** El texto tal como está en disco: con esto se decide si hay cambios. */
	guardado: string;
	/** Sube cuando el contenido se reemplaza desde afuera. Ver el almacén. */
	generacion: number;
	/** La ruta, para elegir el resaltador. `null` en una pestaña nueva. */
	ruta: string | null;
	ajusteLinea: boolean;
	soloLectura: boolean;
	/** Espacios por nivel; `0` significa tabuladores. */
	indentacion: number;
}>();

const emit = defineEmits<{
	sucio: [id: string, sucio: boolean];
	posicion: [linea: number, columna: number];
	guardar: [];
	guardarComo: [];
	abrir: [];
	nueva: [];
	cerrar: [];
	siguiente: [];
	anterior: [];
}>();

const contenedor = ref<HTMLDivElement | null>(null);
let vista: EditorView | null = null;

/**
 * El estado de cada pestaña, por `id`.
 *
 * No es reactivo a propósito: un `EditorState` es un objeto grande e inmutable
 * que cambia en cada tecla, y envolverlo en un `ref` haría que Vue lo recorriera
 * entero cada vez para buscar cambios que a la interfaz no le importan.
 */
const estados = new Map<string, EditorState>();

/**
 * Con qué `generacion` se armó el estado de cada pestaña.
 *
 * Es lo que distingue «hay que rearmar esto porque el archivo se releyó del
 * disco» de «esto es otra pestaña, que tiene su propia generación». Sin la
 * distinción, un watch sobre `generacion` se disparaba al cambiar de pestaña
 * —porque la generación de la otra pestaña es otro número— y descartaba el
 * estado de la que se acababa de mostrar, con sus cambios sin guardar adentro.
 */
const generaciones = new Map<string, number>();

const compLenguaje = new Compartment();
const compAjuste = new Compartment();
const compLectura = new Compartment();
const compIndentacion = new Compartment();

/** El texto que hay ahora en el editor. Lo pide el almacén al guardar. */
function texto(): string {
	return vista?.state.doc.toString() ?? '';
}

/**
 * El texto de **cualquier** pestaña, esté a la vista o no.
 *
 * Hace falta para cerrar la ventana con varias pestañas sin guardar: hay que
 * poder escribir el contenido de las que no están a la vista, y ese contenido
 * vive en el estado de CodeMirror de cada una y no en el almacén.
 *
 * La que está a la vista se lee de la vista y no del mapa: en el mapa está la
 * versión de la última vez que se dejó esa pestaña, así que devolverla perdería
 * todo lo escrito desde entonces — que es justamente lo que se está tratando de
 * no perder.
 */
function textoDe(id: string): string | null {
	if (vista !== null && vista.state.field(idDelEstado, false) === id) {
		return vista.state.doc.toString();
	}
	return estados.get(id)?.doc.toString() ?? null;
}

/** Olvida el estado de una pestaña cerrada, para no acumular documentos. */
function olvidar(id: string) {
	estados.delete(id);
	generaciones.delete(id);
}

defineExpose({ texto, textoDe, olvidar, enfocar, buscar, irALinea, deshacer, rehacer });

function enfocar() {
	vista?.focus();
}

function buscar() {
	if (vista !== null) openSearchPanel(vista);
}

function irALinea() {
	if (vista !== null) gotoLine(vista);
}

function deshacer() {
	if (vista !== null) undo(vista);
}

function rehacer() {
	if (vista !== null) redo(vista);
}

/**
 * Los atajos que no son del editor sino de la aplicación.
 *
 * Van **acá y con la precedencia más alta** porque mientras el foco está en el
 * editor, CodeMirror ve las teclas primero: un escucha en la ventana no recibe
 * `Ctrl+S` nunca. Y con `Prec.highest` para ganarle a los atajos propios de
 * CodeMirror, que también usan algunas de estas combinaciones.
 *
 * `preventDefault` sale de devolver `true`: es lo que le dice a CodeMirror que la
 * tecla ya se usó. Sin eso, `Ctrl+O` abría además el diálogo del motor.
 */
const atajosDeLaApp = Prec.highest(
	keymap.of([
		{
			key: 'Mod-s',
			run: () => {
				emit('guardar');
				return true;
			},
		},
		{
			key: 'Mod-Shift-s',
			run: () => {
				emit('guardarComo');
				return true;
			},
		},
		{
			key: 'Mod-o',
			run: () => {
				emit('abrir');
				return true;
			},
		},
		{
			key: 'Mod-t',
			run: () => {
				emit('nueva');
				return true;
			},
		},
		{
			key: 'Mod-n',
			run: () => {
				emit('nueva');
				return true;
			},
		},
		{
			key: 'Mod-w',
			run: () => {
				emit('cerrar');
				return true;
			},
		},
		// Con Alt y no `Ctrl+Tab`: el compositor y el motor se quedan con
		// `Ctrl+Tab` antes de que llegue, así que ese atajo no funcionaría y
		// parecería que el editor lo ignora.
		{
			key: 'Mod-Alt-ArrowRight',
			run: () => {
				emit('siguiente');
				return true;
			},
		},
		{
			key: 'Mod-Alt-ArrowLeft',
			run: () => {
				emit('anterior');
				return true;
			},
		},
		{ key: 'Mod-g', run: (v) => gotoLine(v) },
	])
);

/**
 * Avisa si hay cambios y dónde está el cursor.
 *
 * El `id` se captura al crear el estado y no se lee de las propiedades: un
 * `update` puede llegar justo después de cambiar de pestaña, y ahí `props`
 * apuntaría a la otra — marcando como sucia la pestaña equivocada.
 */
function escucha(id: string) {
	return EditorView.updateListener.of((update) => {
		// El estado de relleno, el que hay antes de que exista una pestaña, no
		// pertenece a ninguna: lo que pase ahí no se le puede atribuir a nadie.
		if (id === '') return;

		if (update.docChanged) {
			const doc = update.state.doc;
			// La longitud primero: es una comparación de números que descarta
			// casi todos los casos sin recorrer el documento.
			const sucio = doc.length !== props.guardado.length || doc.toString() !== props.guardado;
			emit('sucio', id, sucio);
		}

		if (update.docChanged || update.selectionSet) {
			const posicion = update.state.selection.main.head;
			const linea = update.state.doc.lineAt(posicion);
			emit('posicion', linea.number, posicion - linea.from + 1);
		}
	});
}

function base(id: string): Extension[] {
	return [
		lineNumbers(),
		highlightActiveLineGutter(),
		highlightActiveLine(),
		history(),
		// La propia de CodeMirror y no la del motor: la del motor no dibuja
		// selecciones múltiples ni rectangulares.
		drawSelection(),
		dropCursor(),
		rectangularSelection(),
		highlightSelectionMatches(),
		search({ top: true }),
		EditorState.allowMultipleSelections.of(true),
		atajosDeLaApp,
		keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
		compLenguaje.of([]),
		compAjuste.of([]),
		compLectura.of([]),
		compIndentacion.of([]),
		tema,
		escucha(id),
	];
}

function ajusteDe(activo: boolean): Extension {
	return activo ? EditorView.lineWrapping : [];
}

function lecturaDe(soloLectura: boolean): Extension {
	// Los dos: `readOnly` es el estado y `editable` es lo que decide si el
	// cursor aparece. Con sólo el primero el editor se ve editable y no acepta
	// nada, que es peor que verse bloqueado.
	return soloLectura ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [];
}

function indentacionDe(espacios: number): Extension {
	return indentUnit.of(espacios === 0 ? '\t' : ' '.repeat(espacios));
}

/** Guarda el estado de la pestaña que se está dejando, para poder volver a ella. */
function recordar() {
	if (vista === null) return;
	const anterior = vista.state.field(idDelEstado, false);
	if (anterior !== undefined) estados.set(anterior, vista.state);
}

/**
 * De qué pestaña es un estado.
 *
 * Es un campo del propio estado y no una variable aparte porque una variable
 * puede quedar desincronizada del estado que la vista tiene puesto —pasa con
 * cualquier cambio asincrónico entre medio— y entonces `recordar()` guardaría el
 * estado de una pestaña bajo el `id` de otra, que es la forma de mezclar dos
 * archivos.
 */
const idDelEstado = StateField.define<string>({
	create: () => '',
	update: (valor) => valor,
});

function mostrar(id: string | null) {
	if (vista === null) return;

	if (id === null) {
		vista.setState(EditorState.create({ doc: '', extensions: base('') }));
		return;
	}

	// Se rearma sólo si no hay estado, o si el contenido de **esta** pestaña se
	// reemplazó desde afuera. Comparar la generación guardada con la de ahora es
	// lo que hace que cambiar de pestaña no tire por la borda la otra.
	let estado = estados.get(id);
	if (estado === undefined || generaciones.get(id) !== props.generacion) {
		estado = EditorState.create({
			doc: props.guardado,
			extensions: [idDelEstado.init(() => id), ...base(id)],
		});
		estados.set(id, estado);
		generaciones.set(id, props.generacion);
	}

	vista.setState(estado);
	aplicarConfiguracion();
	cargarLenguaje();
}

/**
 * Reaplica lo que va en compartimentos.
 *
 * Hace falta después de cada `setState`: los compartimentos son parte del
 * estado, así que el estado nuevo trae los valores con los que se creó y no los
 * de ahora. Sin esto, cambiar el ajuste de línea y después de pestaña volvía a
 * dejarlo apagado en la pestaña nueva.
 */
function aplicarConfiguracion() {
	vista?.dispatch({
		effects: [
			compAjuste.reconfigure(ajusteDe(props.ajusteLinea)),
			compLectura.reconfigure(lecturaDe(props.soloLectura)),
			compIndentacion.reconfigure(indentacionDe(props.indentacion)),
		],
	});
}

/**
 * Trae el resaltador del lenguaje de este archivo, si hay uno.
 *
 * Es asincrónico —cada lenguaje es su propio paquete y se carga por demanda— y
 * por eso al volver se comprueba que la pestaña siga siendo la misma: abrir dos
 * archivos rápido dejaba el resaltador del primero puesto en el segundo.
 */
async function cargarLenguaje() {
	const id = props.pestanaId;
	const lenguaje = lenguajes.lenguajeDe(props.ruta);

	if (lenguaje === null) {
		vista?.dispatch({ effects: compLenguaje.reconfigure([]) });
		return;
	}

	try {
		const extension = await lenguajes.cargar(lenguaje);
		if (props.pestanaId !== id) return;
		vista?.dispatch({ effects: compLenguaje.reconfigure(extension) });
	} catch (error) {
		// Un resaltador que no carga no puede dejar sin editar el archivo: se
		// sigue con texto plano, que es exactamente lo que hay sin él.
		console.error('no se pudo cargar el resaltador', error);
	}
}

onMounted(() => {
	if (contenedor.value === null) return;

	vista = new EditorView({
		parent: contenedor.value,
		state: EditorState.create({ doc: '', extensions: base('') }),
	});

	mostrar(props.pestanaId);
	enfocar();
});

onBeforeUnmount(() => {
	vista?.destroy();
	vista = null;
});

watch(
	() => props.pestanaId,
	(nueva) => {
		recordar();
		mostrar(nueva);
		enfocar();
	}
);

// El contenido reemplazado desde afuera —recargar del disco— llega como un
// número que sube. `mostrar` lo compara con el que tenía el estado guardado y lo
// rearma si cambió: su historial es de un contenido que ya no está, y deshacer
// sobre él traería de vuelta el texto viejo mezclado con el nuevo.
watch(
	() => props.generacion,
	() => {
		mostrar(props.pestanaId);
	}
);

watch([() => props.ajusteLinea, () => props.soloLectura, () => props.indentacion], () => {
	aplicarConfiguracion();
});

watch(
	() => props.ruta,
	() => {
		cargarLenguaje();
	}
);
</script>

<template>
  <!-- `min-h-0` y `min-w-0`: sin ellos el editor no se encoge dentro del flex y
       la ventana crece con el archivo más largo en lugar de aparecer el scroll. -->
  <div ref="contenedor" class="min-h-0 min-w-0 flex-1 overflow-hidden" />
</template>
