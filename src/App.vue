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
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import AvisoComponent from '@/components/editor/AvisoComponent.vue';
import BarraEstadoComponent from '@/components/editor/BarraEstadoComponent.vue';
import EditorComponent from '@/components/editor/EditorComponent.vue';
import OpcionesComponent from '@/components/editor/OpcionesComponent.vue';
import SinGuardarComponent from '@/components/editor/SinGuardarComponent.vue';
import TabBarComponent from '@/components/tabs/TabBarComponent.vue';
import { useReactiveIcons } from '@/composables/useReactiveIcon';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';
import { useEditorStore } from '@/stores/editor';
import { OPCIONES_POR_OMISION, type OpcionesAlGuardar, preparar } from '@/tools/al-guardar';
import { rutasDeApertura } from '@/tools/documento';

/** El evento con el que una segunda invocación le pasa sus archivos a ésta. */
const EVENTO_ABRIR = 'abrir-rutas';

const editor = useEditorStore();
const { t } = useI18n();
const { abrirIcon, guardarIcon, buscarIcon } = useReactiveIcons({
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

async function guardar(): Promise<boolean> {
	const activa = editor.activa;
	if (activa === null) return false;

	const listo = paraEscribir(activa.id);
	if (listo === null) return false;

	return await editor.guardar(activa.id, listo.texto, listo.terminaConSalto);
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
		const listo = accion.accion === 'cerrar-ventana' ? await guardarTodas() : await guardar();
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
    <!-- `relative` para que el diálogo modal se apoye en la ventana y no en el
         documento, que con la ventana redondeada le pintaría las esquinas. -->
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div class="flex min-w-0 items-center gap-2 border-b border-ui-border px-2 pb-1">
        <TabBarComponent
          :pestanas="editor.lista"
          :titulos="editor.titulos"
          :activa="editor.pestanas.activa"
          :sin-titulo="t('pestanas.nueva_titulo')"
          :etiquetas="{
            nueva: t('pestanas.nueva'),
            cerrar: t('pestanas.cerrar'),
            sinGuardar: t('pestanas.sin_guardar'),
          }"
          @activar="editor.activar"
          @cerrar="cerrarPestana"
          @mover="editor.mover"
          @nueva="editor.nueva"
        />

        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="rounded-corner-sm p-1 text-tx-muted hover:bg-ui-surface hover:text-tx-main"
            :title="t('acciones.buscar')"
            :aria-label="t('acciones.buscar')"
            @click="vista?.buscar()"
          >
            <img :src="buscarIcon" class="size-4" alt="">
          </button>
          <button
            type="button"
            class="rounded-corner-sm p-1 text-tx-muted hover:bg-ui-surface hover:text-tx-main"
            :title="t('acciones.abrir')"
            :aria-label="t('acciones.abrir')"
            @click="editor.abrirConDialogo()"
          >
            <img :src="abrirIcon" class="size-4" alt="">
          </button>
          <button
            type="button"
            class="rounded-corner-sm p-1 text-tx-muted hover:bg-ui-surface hover:text-tx-main"
            :title="t('acciones.guardar')"
            :aria-label="t('acciones.guardar')"
            @click="guardar()"
          >
            <img :src="guardarIcon" class="size-4" alt="">
          </button>
        </div>
      </div>

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
