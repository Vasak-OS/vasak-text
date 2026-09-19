<script setup lang="ts">
/**
 * El editor de texto de VasakOS, armado.
 *
 * Acá se juntan las tres piezas y se resuelve lo único que ninguna puede
 * resolver sola: **qué pasa cuando se va a perder algo escrito**. Cerrar una
 * pestaña sucia y cerrar la ventana con varias sucias son el mismo problema con
 * dos formas, y por eso comparten un solo estado pendiente en lugar de dos
 * caminos que hay que mantener iguales.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useConfigStore } from '@vasakgroup/plugin-config-manager';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { type ElementoDePestana, TabBar } from '@vasakgroup/vue-libvasak';
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import AvisoComponent from '@/components/editor/AvisoComponent.vue';
import BarraEstadoComponent from '@/components/editor/BarraEstadoComponent.vue';
import EditorComponent from '@/components/editor/EditorComponent.vue';
import OpcionesComponent from '@/components/editor/OpcionesComponent.vue';
import SinGuardarComponent from '@/components/editor/SinGuardarComponent.vue';
import { useReactiveIcons } from '@/composables/useReactiveIcon';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';
import { useEditorStore } from '@/stores/editor';
import { OPCIONES_POR_OMISION, type OpcionesAlGuardar, preparar } from '@/tools/al-guardar';
import { rutasDeApertura } from '@/tools/documento';

/** El evento con el que una segunda invocación le pasa sus archivos a ésta. */
const EVENTO_ABRIR = 'abrir-rutas';

const editor = useEditorStore();
const { t } = useI18n();
const { appIcon, abrirIcon, guardarIcon, buscarIcon } = useReactiveIcons({
	// El mismo nombre que declara el `.desktop`, y como icono y no como
	// símbolo: es el dibujo de la aplicación, no un pictograma de acción. Sin
	// esto la barra de título arrancaba con las pestañas pegadas al borde y sin
	// nada que dijera qué aplicación es.
	appIcon: { name: 'accessories-text-editor', type: 'icon' },
	abrirIcon: 'document-open',
	guardarIcon: 'document-save',
	buscarIcon: 'edit-find',
});

const vista = useTemplateRef<InstanceType<typeof EditorComponent>>('vista');

const linea = ref(1);
const columna = ref(1);
/**
 * El ajuste de línea y la indentación, para toda la ventana y no por archivo.
 *
 * Es una preferencia de cómo se quiere leer, no una propiedad del archivo:
 * tenerla por pestaña obligaría a volver a elegirla en cada una.
 */
const ajusteLinea = ref(false);
const indentacion = ref(4);
const alGuardar = ref<OpcionesAlGuardar>({ ...OPCIONES_POR_OMISION });
const opcionesAbiertas = ref(false);

/** Lo que hay que hacer en cuanto se resuelva qué pasa con lo no guardado. */
type Pendiente = { accion: 'cerrar-pestana'; id: string } | { accion: 'cerrar-ventana' };
const pendiente = ref<Pendiente | null>(null);

const datosActivos = computed(() => editor.activa?.datos ?? null);

/**
 * Las pestañas como las dibuja la barra compartida.
 *
 * El título se calcula sobre la lista entera —dos archivos que se llaman igual
 * muestran también la carpeta—, así que sale del store y no de cada pestaña.
 *
 * `closable` siempre: a diferencia de la terminal, cerrar el último archivo
 * abierto es algo que se pide de verdad y deja una pestaña vacía en su lugar.
 */
const pestanas = computed<ElementoDePestana[]>(() =>
	editor.lista.map((pestana, indice) => ({
		id: pestana.id,
		label: editor.titulos[indice] || t('pestanas.nueva_titulo'),
		dirty: pestana.sucio,
		closable: true,
		// El `tooltip` es la ruta entera: el título se corta, y con dos archivos
		// del mismo nombre en carpetas distintas es lo único que los separa.
		tooltip: pestana.datos.ruta ?? undefined,
	}))
);

/**
 * Reordenar llega como la lista nueva, y el store la quiere como un movimiento.
 *
 * Se deduce comparando: la única que cambió de lugar es la que se arrastró.
 * Traducirlo acá y no cambiar el store es a propósito —`mover(desde, hasta)` es
 * lo que prueban las pruebas de `tools/pestanas`, que son las que sostienen la
 * parte difícil: cuál queda activa después.
 */
function reordenar(nuevas: ElementoDePestana[]) {
	const antes = editor.lista.map((pestana) => pestana.id);
	const despues = nuevas.map((pestana) => pestana.id);
	// Sin cambios, `findIndex` devuelve `-1` y `indexOf` también: un par fuera
	// de rango que `mover` descarta. No hay corte acá a propósito — un segundo
	// lugar donde comprobar los límites es un segundo lugar donde se pueden
	// desincronizar.
	const desde = antes.findIndex((id, i) => id !== despues[i]);
	const hasta = despues.indexOf(antes[desde]);
	editor.mover(desde, hasta);
}

/** Los títulos que se muestran en el diálogo de sin guardar. */
const titulosSucios = computed(() => {
	if (pendiente.value === null) return [];

	const sucias =
		pendiente.value.accion === 'cerrar-ventana'
			? editor.lista.filter((p) => p.sucio)
			: editor.lista.filter((p) => p.id === (pendiente.value as { id: string }).id);

	return sucias.map((p) => {
		const indice = editor.lista.indexOf(p);
		const titulo = editor.titulos[indice] ?? '';
		return titulo.length > 0 ? titulo : t('pestanas.nueva_titulo');
	});
});

// ── Guardar ─────────────────────────────────────────────────────────────────

/**
 * Prepara el texto de una pestaña para escribirlo.
 *
 * Es donde se aplican las dos opciones de guardado, y está en un solo lugar para
 * las tres formas de guardar —la pestaña, «guardar como» y todas al cerrar—:
 * repetirlo daría tres caminos que hay que mantener iguales, y el que se olvide
 * escribiría el archivo con otras reglas sin que nada avise.
 */
function paraEscribir(id: string): { texto: string; terminaConSalto: boolean } | null {
	if (vista.value === null) return null;

	const texto = vista.value.textoDe(id);
	if (texto === null) return null;

	const pestana = editor.lista.find((p) => p.id === id);
	return preparar(texto, pestana?.datos.terminaConSalto ?? true, alGuardar.value);
}

/**
 * Guarda una pestaña; sin `id`, la que está a la vista.
 *
 * El parámetro **no es un adorno**: al cerrar una pestaña sucia que no es la
 * activa y elegir «Guardar», esto se llamaba sin `id` y escribía el archivo de
 * la pestaña activa —que nadie pidió guardar— para después cerrar la otra
 * descartando sus cambios. El diálogo nombraba una pestaña y la acción tocaba
 * otra.
 */
async function guardar(id?: string): Promise<boolean> {
	const objetivo = id ?? editor.activa?.id;
	if (objetivo === undefined) return false;

	const listo = paraEscribir(objetivo);
	if (listo === null) return false;

	return await editor.guardar(objetivo, listo.texto, listo.terminaConSalto);
}

async function guardarComo(id?: string): Promise<boolean> {
	const objetivo = id ?? editor.activa?.id;
	if (objetivo === undefined) return false;

	const listo = paraEscribir(objetivo);
	if (listo === null) return false;

	return await editor.guardarComo(objetivo, listo.texto, listo.terminaConSalto);
}

/**
 * Guarda todas las pestañas con cambios.
 *
 * Se para en la primera que falla y devuelve `false`: seguir guardando las demás
 * después de un error deja a medias algo que se pidió como una sola cosa, y lo
 * que viene después es cerrar la ventana.
 */
async function guardarTodas(): Promise<boolean> {
	if (vista.value === null) return false;

	for (const pestana of editor.lista.filter((p) => p.sucio)) {
		const listo = paraEscribir(pestana.id);
		if (listo === null) continue;
		if (!(await editor.guardar(pestana.id, listo.texto, listo.terminaConSalto))) {
			return false;
		}
	}
	return true;
}

// ── Cerrar, que es donde se puede perder algo ───────────────────────────────

function cerrarPestana(id: string) {
	const pestana = editor.lista.find((p) => p.id === id);
	if (pestana === undefined) return;

	if (pestana.sucio) {
		pendiente.value = { accion: 'cerrar-pestana', id };
		return;
	}

	vista.value?.olvidar(id);
	editor.cerrar(id);
}

async function resolverPendiente(guardando: boolean) {
	const accion = pendiente.value;
	if (accion === null) return;

	if (guardando) {
		const listo =
			accion.accion === 'cerrar-ventana' ? await guardarTodas() : await guardar(accion.id);
		// Si no se pudo guardar —o se canceló el diálogo de «guardar como»— no se
		// sigue: el aviso queda a la vista y nada se pierde.
		if (!listo) {
			pendiente.value = null;
			return;
		}
	}

	pendiente.value = null;

	if (accion.accion === 'cerrar-pestana') {
		vista.value?.olvidar(accion.id);
		editor.cerrar(accion.id);
	} else {
		// La ventana se cierra a mano porque el pedido original se canceló para
		// poder preguntar.
		await getCurrentWindow().destroy();
	}
}

// ── Arranque ────────────────────────────────────────────────────────────────

let dejarDeEscuchar: UnlistenFn | null = null;
let dejarDeEscucharConfig: UnlistenFn | null = null;
let dejarDeEscucharCierre: UnlistenFn | null = null;

async function abrirVarias(rutas: string[]) {
	for (const ruta of rutas) {
		await editor.abrir(ruta);
	}
}

onMounted(async () => {
	try {
		const configStore = useConfigStore();
		await configStore.loadConfig();

		dejarDeEscucharConfig = await listen('config-changed', async () => {
			document.startViewTransition(() => {
				configStore.loadConfig();
			});
		});
	} catch (error) {
		console.error('Error al cargar configuración en App.vue', error);
	}

	// Los archivos con los que se abrió la aplicación. Si no hay ninguno, una
	// pestaña vacía: una ventana sin nada abierto no ofrece por dónde empezar.
	try {
		const rutas = await rutasDeApertura();
		await abrirVarias(rutas);
	} catch (error) {
		console.error('no se pudieron leer los archivos de la línea de órdenes', error);
	}
	if (editor.lista.length === 0) editor.nueva();

	// Una segunda invocación —el «abrir con» del gestor de archivos— manda sus
	// rutas acá en lugar de levantar otra ventana.
	dejarDeEscuchar = await listen<string[]>(EVENTO_ABRIR, (evento) => {
		abrirVarias(evento.payload);
	});

	// Cerrar la ventana con cambios sin guardar pregunta **una vez por todas**,
	// no una por pestaña.
	dejarDeEscucharCierre = await getCurrentWindow().onCloseRequested((evento) => {
		if (!editor.hayCambiosSinGuardar) return;
		evento.preventDefault();
		pendiente.value = { accion: 'cerrar-ventana' };
	});
});

onUnmounted(() => {
	dejarDeEscuchar?.();
	dejarDeEscucharConfig?.();
	dejarDeEscucharCierre?.();
});
</script>

<template>
  <WindowAppLayout>
    <!-- El icono y las pestañas van **en la barra de la ventana**, como en la
         terminal: es la misma barra que lleva los botones, así que las pestañas
         quedan a su altura y no en una segunda fila. -->
    <template #identidad>
      <img :src="appIcon" class="size-7 shrink-0" :alt="t('app.nombre')">
    </template>

    <template #barra>
      <TabBar
        :tabs="pestanas"
        :model-value="editor.pestanas.activa ?? ''"
        :new-label="t('pestanas.nueva')"
        :close-label="t('pestanas.cerrar')"
        :dirty-label="t('pestanas.sin_guardar')"
        @select="editor.activar"
        @close="cerrarPestana"
        @reorder="reordenar"
        @new="editor.nueva"
      />
    </template>

    <!-- Las acciones de la ventana, junto a los botones de la ventana. -->
    <template #acciones>
      <button
        type="button"
        class="rounded-corner border border-ui-border bg-ui-bg/80 p-1 hover:bg-ui-surface"
        :title="t('acciones.buscar')"
        :aria-label="t('acciones.buscar')"
        @click="vista?.buscar()"
      >
        <img :src="buscarIcon" class="size-4" alt="">
      </button>
      <button
        type="button"
        class="rounded-corner border border-ui-border bg-ui-bg/80 p-1 hover:bg-ui-surface"
        :title="t('acciones.abrir')"
        :aria-label="t('acciones.abrir')"
        @click="editor.abrirConDialogo()"
      >
        <img :src="abrirIcon" class="size-4" alt="">
      </button>
      <button
        type="button"
        class="rounded-corner border border-ui-border bg-ui-bg/80 p-1 hover:bg-ui-surface"
        :title="t('acciones.guardar')"
        :aria-label="t('acciones.guardar')"
        @click="guardar()"
      >
        <img :src="guardarIcon" class="size-4" alt="">
      </button>
    </template>

    <!-- `relative` para que el diálogo modal se apoye en la ventana y no en el
         documento, que con la ventana redondeada le pintaría las esquinas. -->
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <EditorComponent
        ref="vista"
        :pestana-id="editor.pestanas.activa"
        :guardado="datosActivos?.guardado ?? ''"
        :generacion="datosActivos?.generacion ?? 0"
        :ruta="datosActivos?.ruta ?? null"
        :ajuste-linea="ajusteLinea"
        :solo-lectura="datosActivos?.soloLectura ?? false"
        :indentacion="indentacion"
        @sucio="editor.marcarSucio"
        @posicion="(l, c) => { linea = l; columna = c; }"
        @guardar="guardar()"
        @guardar-como="guardarComo()"
        @abrir="editor.abrirConDialogo()"
        @nueva="editor.nueva"
        @cerrar="editor.pestanas.activa && cerrarPestana(editor.pestanas.activa)"
        @siguiente="editor.siguiente"
        @anterior="editor.anterior"
      />

      <AvisoComponent
        v-if="editor.aviso !== null"
        :aviso="editor.aviso"
        @cerrar="editor.limpiarAviso"
        @recargar="editor.recargar"
        @guardar-como="guardarComo"
      />

      <BarraEstadoComponent
        :linea="linea"
        :columna="columna"
        :ruta="datosActivos?.ruta ?? null"
        :fin-de-linea="datosActivos?.finDeLinea ?? 'lf'"
        :solo-lectura="datosActivos?.soloLectura ?? false"
        :ajuste-linea="ajusteLinea"
        :indentacion="indentacion"
        @opciones="opcionesAbiertas = true"
        @ir-a-linea="vista?.irALinea()"
      />

      <OpcionesComponent
        v-if="opcionesAbiertas"
        :indentacion="indentacion"
        :ajuste-linea="ajusteLinea"
        :al-guardar="alGuardar"
        @indentacion="(valor) => { indentacion = valor; }"
        @alternar-ajuste="ajusteLinea = !ajusteLinea"
        @al-guardar="(valor) => { alGuardar = valor; }"
        @cerrar="opcionesAbiertas = false"
      />

      <SinGuardarComponent
        v-if="pendiente !== null"
        :titulos="titulosSucios"
        @guardar="resolverPendiente(true)"
        @descartar="resolverPendiente(false)"
        @cancelar="pendiente = null"
      />
    </div>
  </WindowAppLayout>
</template>
