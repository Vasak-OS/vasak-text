<script lang="ts" setup>
/**
 * La barra de abajo: dónde está el cursor y en qué condición está el archivo.
 *
 * Lo que muestra no es decorativo. El fin de línea y el «sólo lectura» son las
 * dos cosas que explican un comportamiento que de otro modo desconcierta: por
 * qué un `git diff` marca todo el archivo, por qué guardar no funciona.
 *
 * Los dos botones son `ActionButton` fantasma y chicos, y el «sólo lectura» es
 * un `Badge` de advertencia: los tres estaban dibujados a mano. La barra no
 * lleva relleno vertical porque el botón chico ya mide 24 px, que es lo que
 * medía la barra con su texto y su relleno: así no crece.
 *
 * En una ventana angosta los elementos bajan de renglón (`flex-wrap`) en lugar
 * de encogerse: el botón deja partir su texto en cualquier letra, y encogido
 * hasta cero escribía «Línea 1, columna 1» de a una letra por renglón.
 *
 * El resumen de las preferencias es el disparador del globo de opciones
 * (`PopoverTrigger`), y la barra es su ancla: el globo se abre por arriba de
 * ella, pegado a la derecha, que es donde estaba el panel propio. El ancla no
 * es la barra entera sino una línea sin alto sobre su canto de arriba: lo que
 * está adentro del ancla no cuenta como «afuera», y con la barra entera un
 * clic en «Línea 1, columna 1» con el globo abierto no lo cerraba. Las dos
 * piezas inyectan el `Popover` que las envuelve en `App.vue`; sin él (en una
 * prueba) usan uno suelto.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, Badge, PopoverAnchor, PopoverTrigger } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import type { FinDeLinea } from '@/tools/documento';
import { interpolate } from '@/tools/interpolate';
import { lenguajeDe, NOMBRE_VISIBLE } from '@/tools/lenguajes';

const props = defineProps<{
	line: number;
	column: number;
	path: string | null;
	lineEnding: FinDeLinea;
	readOnly: boolean;
	lineWrap: boolean;
	/** Espacios por nivel; `0` es tabuladores. */
	indentWidth: number;
}>();

const emit = defineEmits<{ goToLine: [] }>();

const { t } = useI18n();

const position = computed(() => interpolate(t('estado.posicion'), props.line, props.column));

/**
 * El nombre del lenguaje, o «Texto» si no se reconoce.
 *
 * El nombre visible y no el identificador interno: al lado de texto traducido,
 * un `javascript` en minúsculas se leía como un dato crudo que se escapó.
 */
const language = computed(() => {
	const which = lenguajeDe(props.path);
	return which === null ? t('estado.sin_lenguaje') : NOMBRE_VISIBLE[which];
});

/**
 * El resumen de las preferencias, que es también el botón que las abre.
 *
 * Muestra la indentación porque es la que explica un archivo que se ve mal
 * alineado, y agrega el ajuste de línea sólo cuando está prendido: nombrar lo
 * que está apagado llena la barra de estados que no son noticia.
 */
const summary = computed(() => {
	const indent =
		props.indentWidth === 0
			? t('opciones.tabulador')
			: interpolate(t('opciones.espacios'), props.indentWidth);

	return props.lineWrap ? `${indent} · ${t('estado.ajuste_linea')}` : indent;
});
</script>

<template>
  <div
    class="relative flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 border-t border-ui-line px-3 text-tx-muted text-xs"
  >
    <!-- Absoluta, sin alto y vacía: no ocupa lugar en la fila, no recibe clics
         y no tiene nada que leer. -->
    <PopoverAnchor class="pointer-events-none absolute inset-x-0 top-0 h-0" />

    <!-- Clicable: es donde se mira la línea, así que es donde se espera poder
         pedir ir a otra. -->
    <ActionButton
      variant="ghost"
      size="sm"
      class="max-w-full shrink-0"
      :label="position"
      :title="t('estado.ir_a_linea')"
      @click="emit('goToLine')"
    />

    <span class="flex-1" />

    <Badge v-if="readOnly" tone="warning" :label="t('estado.solo_lectura')" />

    <PopoverTrigger as-child>
      <ActionButton
        variant="ghost"
        size="sm"
        class="max-w-full shrink-0"
        :label="summary"
        :title="t('opciones.titulo')"
      />
    </PopoverTrigger>

    <!-- En mayúsculas y sin traducir: «LF» y «CRLF» son los nombres, no
         palabras. -->
    <span class="uppercase">{{ lineEnding }}</span>
    <span>{{ language }}</span>
  </div>
</template>
