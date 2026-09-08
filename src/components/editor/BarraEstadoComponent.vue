<script lang="ts" setup>
/**
 * La barra de abajo: dónde está el cursor y en qué condición está el archivo.
 *
 * Lo que muestra no es decorativo. El fin de línea y el «sólo lectura» son las
 * dos cosas que explican un comportamiento que de otro modo desconcierta: por
 * qué un `git diff` marca todo el archivo, por qué guardar no funciona.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed } from 'vue';
import type { FinDeLinea } from '@/tools/documento';
import { interpolar } from '@/tools/interpolar';
import { lenguajeDe } from '@/tools/lenguajes';

const props = defineProps<{
	linea: number;
	columna: number;
	ruta: string | null;
	finDeLinea: FinDeLinea;
	soloLectura: boolean;
	ajusteLinea: boolean;
	/** Espacios por nivel; `0` es tabuladores. */
	indentacion: number;
}>();

const emit = defineEmits<{ opciones: []; irALinea: [] }>();

const { t } = useI18n();

const posicion = computed(() => interpolar(t('estado.posicion'), props.linea, props.columna));

/** El nombre del lenguaje, o «Texto» si no se reconoce. */
const lenguaje = computed(() => lenguajeDe(props.ruta) ?? t('estado.sin_lenguaje'));

/**
 * El resumen de las preferencias, que es también el botón que las abre.
 *
 * Muestra la indentación porque es la que explica un archivo que se ve mal
 * alineado, y agrega el ajuste de línea sólo cuando está prendido: nombrar lo
 * que está apagado llena la barra de estados que no son noticia.
 */
const resumen = computed(() => {
	const sangria =
		props.indentacion === 0
			? t('opciones.tabulador')
			: interpolar(t('opciones.espacios'), props.indentacion);

	return props.ajusteLinea ? `${sangria} · ${t('estado.ajuste_linea')}` : sangria;
});
</script>

<template>
  <div
    class="flex shrink-0 items-center gap-3 border-t border-ui-border px-3 py-1 text-tx-muted text-xs"
  >
    <!-- Clicable: es donde se mira la línea, así que es donde se espera poder
         pedir ir a otra. -->
    <button
      type="button"
      class="rounded-corner-sm px-1 hover:bg-ui-surface hover:text-tx-main"
      :title="t('estado.ir_a_linea')"
      @click="emit('irALinea')"
    >
      {{ posicion }}
    </button>

    <span class="flex-1" />

    <span
      v-if="soloLectura"
      class="rounded-corner-sm bg-status-warning/20 px-1.5 text-tx-main"
    >
      {{ t('estado.solo_lectura') }}
    </span>

    <button
      type="button"
      class="rounded-corner-sm px-1 hover:bg-ui-surface hover:text-tx-main"
      :title="t('opciones.titulo')"
      @click="emit('opciones')"
    >
      {{ resumen }}
    </button>

    <!-- En mayúsculas y sin traducir: «LF» y «CRLF» son los nombres, no
         palabras. -->
    <span class="uppercase">{{ finDeLinea }}</span>
    <span>{{ lenguaje }}</span>
  </div>
</template>
