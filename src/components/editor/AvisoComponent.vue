<script lang="ts" setup>
/**
 * La barra de avisos: errores al abrir, al guardar, y el archivo que cambió en
 * disco.
 *
 * Es una barra y no un diálogo modal porque casi todos estos avisos no piden
 * ninguna decisión: decir «no se encontró el archivo» tapando la pantalla
 * obliga a apretar «aceptar» para volver a lo que se estaba haciendo. El único
 * que sí pide decisión —el archivo cambió en disco— trae sus dos botones acá
 * mismo.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed } from 'vue';
import { useReactiveIcons } from '@/composables/useReactiveIcon';
import type { Aviso } from '@/stores/editor';
import type { ErrorAlAbrir } from '@/tools/documento';
import { interpolar } from '@/tools/interpolar';

const props = defineProps<{ aviso: Aviso }>();
const emit = defineEmits<{ cerrar: []; recargar: [id: string]; guardarComo: [id: string] }>();

const { t } = useI18n();
const { cerrarIcon } = useReactiveIcons({ cerrarIcon: 'window-close' });

/** Sólo el nombre del archivo: la ruta completa no cabe y lo importante es cuál. */
function nombre(ruta: string): string {
	const partes = ruta.split('/');
	return partes[partes.length - 1] ?? ruta;
}

/** Los bytes en algo legible, para el aviso de «demasiado grande». */
function tamano(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return mb >= 1 ? `${mb.toFixed(0)} MB` : `${Math.round(bytes / 1024)} kB`;
}

/** Por qué no se pudo abrir, cada caso con su propia explicación. */
function porQueNoAbrio(ruta: string, causa: ErrorAlAbrir): string {
	const archivo = nombre(ruta);

	switch (causa.clase) {
		case 'no-existe':
			return interpolar(t('avisos.no_existe'), archivo);
		case 'es-un-directorio':
			return interpolar(t('avisos.es_un_directorio'), archivo);
		case 'demasiado-grande':
			return interpolar(t('avisos.demasiado_grande'), archivo, tamano(causa.detalle));
		case 'binario':
			return interpolar(t('avisos.binario'), archivo);
		case 'no-es-texto':
			return interpolar(t('avisos.no_es_texto'), archivo);
		case 'sistema':
			return interpolar(t('avisos.error_al_abrir'), archivo, causa.detalle);
	}
}

const mensaje = computed(() => {
	const aviso = props.aviso;

	switch (aviso.tipo) {
		case 'guardado':
			return t('avisos.guardado');
		case 'cambio-en-disco':
			return interpolar(t('avisos.cambio_en_disco'), nombre(aviso.ruta));
		case 'no-se-pudo-abrir':
			return porQueNoAbrio(aviso.ruta, aviso.causa);
		case 'no-se-pudo-guardar':
			return interpolar(
				t('avisos.error_al_guardar'),
				nombre(aviso.ruta),
				aviso.causa.clase === 'sistema' ? aviso.causa.detalle : ''
			);
	}
});

/** Si es una falla o sólo una confirmación: cambia el color, no el texto. */
const esError = computed(() => props.aviso.tipo !== 'guardado');
</script>

<template>
  <div
    class="flex shrink-0 items-center gap-3 border-t px-3 py-2 text-sm"
    :class="esError
      ? 'border-status-error/40 bg-status-error/10 text-tx-main'
      : 'border-status-success/40 bg-status-success/10 text-tx-main'"
    :role="esError ? 'alert' : 'status'"
  >
    <span class="min-w-0 flex-1">{{ mensaje }}</span>

    <template v-if="aviso.tipo === 'cambio-en-disco'">
      <button
        type="button"
        class="shrink-0 rounded-corner-sm border border-ui-border-strong px-2 py-0.5 hover:bg-ui-surface"
        @click="emit('recargar', aviso.id)"
      >
        {{ t('avisos.recargar') }}
      </button>
      <button
        type="button"
        class="shrink-0 rounded-corner-sm border border-ui-border-strong px-2 py-0.5 hover:bg-ui-surface"
        @click="emit('guardarComo', aviso.id)"
      >
        {{ t('avisos.guardar_igual') }}
      </button>
    </template>

    <button
      type="button"
      class="shrink-0 rounded-corner-sm p-1 hover:bg-ui-surface"
      :title="t('avisos.cerrar')"
      :aria-label="t('avisos.cerrar')"
      @click="emit('cerrar')"
    >
      <img :src="cerrarIcon" class="size-3" alt="">
    </button>
  </div>
</template>
