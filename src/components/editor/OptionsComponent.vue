<script lang="ts" setup>
/**
 * Las preferencias de edición, en un panel que se abre desde la barra de estado.
 *
 * Están juntas y no repartidas por la barra porque son cinco cosas que se tocan
 * una vez y no se vuelven a mirar: sumarlas todas a la barra la convertiría en
 * una fila de botones donde lo que sí se lee seguido —la línea y la columna—
 * dejaría de encontrarse.
 *
 * Las dos de guardado llevan un aviso escrito: son las únicas que **cambian el
 * archivo más allá de lo editado**, y por eso vienen apagadas. Ver
 * `tools/save-options.ts`.
 *
 * Todo sale de la librería. El panel es el `PopoverContent` de vue-libvasak
 * 2.2.0 —antes era un `div` propio sobre un fondo que tapaba la ventana—; el
 * ancho de la sangría es un `SegmentedControl` (un grupo de radio con flechas,
 * no cuatro botones sueltos) y las tres casillas son `Checkbox` —casillas, como
 * eran: cambiarlas por interruptores sería cambiar la pantalla—.
 *
 * El globo cuelga de la barra de estado (`PopoverAnchor` en
 * `StatusBarComponent`), por arriba y alineado a la derecha: el mismo lugar
 * que ocupaba el panel propio, con el mismo ancho. El foco, Escape y el clic
 * afuera los resuelve el globo: el foco entra al primer control al abrir,
 * Escape cierra y lo devuelve al botón que lo abrió —el panel propio lo dejaba
 * caer al `body`—, y un clic afuera cierra sin moverlo. Por eso el componente
 * ya no emite `close` ni enfoca nada por su cuenta.
 *
 * `w-72` y `text-sm` son los del panel propio; el relleno `md` del globo es su
 * `p-3`, y el alto y el ancho máximos los pone el globo contra la ventana. Lo
 * dice acá y no arriba de la raíz de la plantilla: un comentario ahí la vuelve
 * un fragmento.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	Checkbox,
	PopoverContent,
	SegmentedControl,
	type SegmentedOption,
} from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import { interpolate } from '@/tools/interpolate';
import type { SaveOptions } from '@/tools/save-options';

const props = defineProps<{
	/** Espacios por nivel; `0` es tabuladores. */
	indentWidth: number;
	lineWrap: boolean;
	saveOptions: SaveOptions;
}>();

const emit = defineEmits<{
	indentWidth: [spaces: number];
	toggleLineWrap: [];
	saveOptions: [options: SaveOptions];
}>();

const { t } = useI18n();

/** Las anchuras que se ofrecen. `0` es el tabulador. */
const WIDTHS = [0, 2, 4, 8];

/** Lo que dice cada segmento: «Tabulador» o el número, como antes. */
const widthOptions = computed<SegmentedOption<number>[]>(() =>
	WIDTHS.map((width) => ({
		value: width,
		label: width === 0 ? t('opciones.tabulador') : String(width),
	}))
);

function describeWidth(width: number): string {
	return width === 0 ? t('opciones.tabulador') : interpolate(t('opciones.espacios'), width);
}

function toggle(field: keyof SaveOptions) {
	emit('saveOptions', { ...props.saveOptions, [field]: !props.saveOptions[field] });
}
</script>

<template>
  <PopoverContent
    side="top"
    align="end"
    :side-offset="8"
    :label="t('opciones.titulo')"
    class="w-72 text-sm"
  >
    <h2 class="font-title text-tx-main">{{ t('opciones.titulo') }}</h2>

    <p class="mt-3 text-tx-muted text-xs">{{ t('opciones.indentacion') }}</p>
    <SegmentedControl
      class="mt-1"
      :options="widthOptions"
      :label="t('opciones.indentacion')"
      :model-value="indentWidth"
      @change="(width) => emit('indentWidth', width)"
    />
    <p class="mt-1 text-tx-muted text-xs">{{ describeWidth(indentWidth) }}</p>

    <Checkbox
      class="mt-1"
      :label="t('estado.ajuste_linea')"
      :model-value="lineWrap"
      @change="emit('toggleLineWrap')"
    />

    <p class="mt-1 text-tx-muted text-xs">{{ t('opciones.al_guardar') }}</p>
    <!-- En columna: la casilla de la librería va en línea, y dos seguidas
         compartirían renglón si caben. -->
    <div class="flex min-w-0 flex-col">
      <Checkbox
        :label="t('opciones.quitar_espacios')"
        :model-value="saveOptions.trimTrailingWhitespace"
        @change="toggle('trimTrailingWhitespace')"
      />
      <Checkbox
        :label="t('opciones.agregar_salto')"
        :model-value="saveOptions.insertFinalNewline"
        @change="toggle('insertFinalNewline')"
      />
    </div>
    <p class="mt-1 text-tx-muted text-xs">{{ t('opciones.aviso') }}</p>
  </PopoverContent>
</template>
