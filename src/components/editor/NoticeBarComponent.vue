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
 *
 * La dibuja la librería: `AlertMessage` en su variante `banner`, que es la
 * barra pegada abajo y de lado a lado que acá estaba hecha a mano. El color y
 * el rol (`alert` para el error, `status` para lo demás) salen del tono, así
 * que no queda ninguna tabla copiada; los botones van en la ranura `actions` y
 * la cruz es la de `dismissible`.
 *
 * El comentario va en el docblock y no arriba de la raíz de la plantilla: un
 * comentario ahí la convierte en un fragmento, y con eso se pierde la raíz —los
 * atributos dejan de caer y `classes()` devuelve vacío—.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, AlertMessage, type NoticeTone } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import type { Aviso } from '@/stores/editor';
import type { ErrorAlAbrir } from '@/tools/documento';
import { interpolate } from '@/tools/interpolate';

const props = defineProps<{ notice: Aviso }>();
const emit = defineEmits<{ close: []; reload: [id: string]; saveAs: [id: string] }>();

const { t } = useI18n();

/** Sólo el nombre del archivo: la ruta completa no cabe y lo importante es cuál. */
function fileName(path: string): string {
	const parts = path.split('/');
	return parts[parts.length - 1] ?? path;
}

/** Los bytes en algo legible, para el aviso de «demasiado grande». */
function humanSize(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return mb >= 1 ? `${mb.toFixed(0)} MB` : `${Math.round(bytes / 1024)} kB`;
}

/** Por qué no se pudo abrir, cada caso con su propia explicación. */
function whyItDidNotOpen(path: string, cause: ErrorAlAbrir): string {
	const file = fileName(path);

	switch (cause.clase) {
		case 'no-existe':
			return interpolate(t('avisos.no_existe'), file);
		case 'es-un-directorio':
			return interpolate(t('avisos.es_un_directorio'), file);
		case 'demasiado-grande':
			return interpolate(t('avisos.demasiado_grande'), file, humanSize(cause.detalle));
		case 'binario':
			return interpolate(t('avisos.binario'), file);
		case 'no-es-texto':
			return interpolate(t('avisos.no_es_texto'), file);
		case 'sistema':
			return interpolate(t('avisos.error_al_abrir'), file, cause.detalle);
	}
}

const message = computed(() => {
	const notice = props.notice;

	switch (notice.tipo) {
		case 'guardado':
			return t('avisos.guardado');
		case 'cambio-en-disco':
			return interpolate(t('avisos.cambio_en_disco'), fileName(notice.ruta));
		case 'ya-abierto':
			return interpolate(t('avisos.ya_abierto'), fileName(notice.ruta));
		case 'no-se-pudo-abrir':
			return whyItDidNotOpen(notice.ruta, notice.causa);
		case 'no-se-pudo-guardar':
			return interpolate(
				t('avisos.error_al_guardar'),
				fileName(notice.ruta),
				notice.causa.clase === 'sistema' ? notice.causa.detalle : ''
			);
	}
});

/** Si es una falla o sólo una confirmación: cambia el color, no el texto. */
const tone = computed<NoticeTone>(() => (props.notice.tipo === 'guardado' ? 'success' : 'error'));
</script>

<template>
  <AlertMessage
    variant="banner"
    :tone="tone"
    dismissible
    :close-label="t('avisos.cerrar')"
    class="shrink-0"
    @close="emit('close')"
  >
    {{ message }}
    <template v-if="notice.tipo === 'cambio-en-disco'" #actions>
      <ActionButton
        variant="secondary"
        size="sm"
        :label="t('avisos.recargar')"
        @click="emit('reload', notice.id)"
      />
      <ActionButton
        variant="secondary"
        size="sm"
        :label="t('avisos.guardar_igual')"
        @click="emit('saveAs', notice.id)"
      />
    </template>
  </AlertMessage>
</template>
