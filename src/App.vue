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
import { ActionButton, Popover, TabBar, type TabEntry, ThemeIcon } from '@vasakgroup/vue-libvasak';
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import EditorComponent from '@/components/editor/EditorComponent.vue';
import NoticeBarComponent from '@/components/editor/NoticeBarComponent.vue';
import OptionsComponent from '@/components/editor/OptionsComponent.vue';
import StatusBarComponent from '@/components/editor/StatusBarComponent.vue';
import UnsavedChangesComponent from '@/components/editor/UnsavedChangesComponent.vue';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';
import { useEditorStore } from '@/stores/editor';
import { rutasDeApertura } from '@/tools/documento';
import { DEFAULT_SAVE_OPTIONS, prepareForSave, type SaveOptions } from '@/tools/save-options';

/** El evento con el que una segunda invocación le pasa sus archivos a ésta. */
const EVENTO_ABRIR = 'abrir-rutas';

const editor = useEditorStore();
const { t } = useI18n();
const vista = useTemplateRef<InstanceType<typeof EditorComponent>>('vista');

const line = ref(1);
const column = ref(1);
/**
 * El ajuste de línea y la indentación, para toda la ventana y no por archivo.
 *
 * Es una preferencia de cómo se quiere leer, no una propiedad del archivo:
 * tenerla por pestaña obligaría a volver a elegirla en cada una.
 */
const lineWrap = ref(false);
const indentWidth = ref(4);
const saveOptions = ref<SaveOptions>({ ...DEFAULT_SAVE_OPTIONS });
const optionsOpen = ref(false);

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
const pestanas = computed<TabEntry[]>(() =>
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
 * Traducirlo acá y no cambiar el store es a propósito: `mover(desde, hasta)` es
 * lo que prueban las pruebas de `tools/pestanas`, que son las que sostienen la
 * parte difícil —cuál queda activa después de mover—.
 *
 * **No alcanza con el primer índice que difiere.** Con `[a, b, c] → [c, a, b]`
 * eso da `desde = 0`, y lo que se movió fue la última al principio: el
 * movimiento que sale de ahí deja `[b, a, c]`, que no es lo que se arrastró. El
 * primer índice distinto es donde **empieza** el bloque que se corrió, y puede
 * ser tanto el origen como el destino. Así que hay dos candidatos y se aplica el
 * que reconstruye la lista emitida.
 */
function reordenar(nuevas: TabEntry[]) {
	const antes = editor.lista.map((pestana) => pestana.id);
	const despues = nuevas.map((pestana) => pestana.id);
	const primera = antes.findIndex((id, indice) => id !== despues[indice]);
	if (primera < 0) return;

	const mover = (desde: number, hasta: number) => {
		const lista = [...antes];
		const [movida] = lista.splice(desde, 1);
		lista.splice(hasta, 0, movida);
		return lista;
	};
	const iguales = (una: string[], otra: string[]) =>
		una.length === otra.length && una.every((id, indice) => id === otra[indice]);

	// Se fue hacia adelante: la que estaba en `primera` aparece más allá.
	const haciaAdelante: [number, number] = [primera, despues.indexOf(antes[primera])];
	// Se vino hacia atrás: la que ahora está en `primera` estaba más allá.
	const haciaAtras: [number, number] = [antes.indexOf(despues[primera]), primera];

	for (const [desde, hasta] of [haciaAdelante, haciaAtras]) {
		if (desde < 0 || hasta < 0) continue;
		if (iguales(mover(desde, hasta), despues)) {
			editor.mover(desde, hasta);
			return;
		}
	}
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
function prepareTab(id: string): { text: string; endsWithNewline: boolean } | null {
	if (vista.value === null) return null;

	const texto = vista.value.textoDe(id);
	if (texto === null) return null;

	const pestana = editor.lista.find((p) => p.id === id);
	return prepareForSave(texto, pestana?.datos.terminaConSalto ?? true, saveOptions.value);
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

	const ready = prepareTab(objetivo);
	if (ready === null) return false;

	return await editor.guardar(objetivo, ready.text, ready.endsWithNewline);
}

async function guardarComo(id?: string): Promise<boolean> {
	const objetivo = id ?? editor.activa?.id;
	if (objetivo === undefined) return false;

	const ready = prepareTab(objetivo);
	if (ready === null) return false;

	return await editor.guardarComo(objetivo, ready.text, ready.endsWithNewline);
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
		const ready = prepareTab(pestana.id);
		if (ready === null) continue;
		if (!(await editor.guardar(pestana.id, ready.text, ready.endsWithNewline))) {
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
      <!-- El mismo nombre que declara el `.desktop`, y como icono y no como
           símbolo: es el dibujo de la aplicación, no un pictograma de acción. -->
      <ThemeIcon name="accessories-text-editor" :size="28" :alt="t('app.nombre')" />
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
      <!-- Fantasmas y chicos: al lado de los botones de la ventana, un borde
           propio en cada uno los hacía competir con ellos. El nombre accesible
           y el globo salen de `iconAlt` y `title`. -->
      <ActionButton
        variant="ghost"
        size="sm"
        label=""
        icon="edit-find"
        :icon-alt="t('acciones.buscar')"
        :title="t('acciones.buscar')"
        @click="vista?.buscar()"
      />
      <ActionButton
        variant="ghost"
        size="sm"
        label=""
        icon="document-open"
        :icon-alt="t('acciones.abrir')"
        :title="t('acciones.abrir')"
        @click="editor.abrirConDialogo()"
      />
      <ActionButton
        variant="ghost"
        size="sm"
        label=""
        icon="document-save"
        :icon-alt="t('acciones.guardar')"
        :title="t('acciones.guardar')"
        @click="guardar()"
      />
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
        :ajuste-linea="lineWrap"
        :solo-lectura="datosActivos?.soloLectura ?? false"
        :indentacion="indentWidth"
        @sucio="editor.marcarSucio"
        @posicion="(l, c) => { line = l; column = c; }"
        @guardar="guardar()"
        @guardar-como="guardarComo()"
        @abrir="editor.abrirConDialogo()"
        @nueva="editor.nueva"
        @cerrar="editor.pestanas.activa && cerrarPestana(editor.pestanas.activa)"
        @siguiente="editor.siguiente"
        @anterior="editor.anterior"
      />

      <NoticeBarComponent
        v-if="editor.aviso !== null"
        :notice="editor.aviso"
        @close="editor.limpiarAviso"
        @reload="editor.recargar"
        @save-as="guardarComo"
      />

      <!-- El globo de opciones: la barra de estado tiene el disparador y el
           ancla, y `OptionsComponent` es el contenido. `Popover` no dibuja
           ningún elemento, así que la columna queda como estaba. -->
      <Popover v-model:open="optionsOpen">
        <StatusBarComponent
          :line="line"
          :column="column"
          :path="datosActivos?.ruta ?? null"
          :line-ending="datosActivos?.finDeLinea ?? 'lf'"
          :read-only="datosActivos?.soloLectura ?? false"
          :line-wrap="lineWrap"
          :indent-width="indentWidth"
          @go-to-line="vista?.irALinea()"
        />

        <OptionsComponent
          :indent-width="indentWidth"
          :line-wrap="lineWrap"
          :save-options="saveOptions"
          @indent-width="(width) => { indentWidth = width; }"
          @toggle-line-wrap="lineWrap = !lineWrap"
          @save-options="(options) => { saveOptions = options; }"
        />
      </Popover>

      <UnsavedChangesComponent
        v-if="pendiente !== null"
        :titles="titulosSucios"
        @save="resolverPendiente(true)"
        @discard="resolverPendiente(false)"
        @cancel="pendiente = null"
      />
    </div>
  </WindowAppLayout>
</template>
