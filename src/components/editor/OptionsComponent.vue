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
 * `tools/al-guardar.ts`.
 *
 * Lo de adentro sale de la librería: el ancho de la sangría es un
 * `SegmentedControl` (un grupo de radio con flechas, no cuatro botones sueltos)
 * y las tres casillas son `Checkbox` —casillas, como eran: cambiarlas por
 * interruptores sería cambiar la pantalla—. El panel que flota todavía es
 * propio: lo reemplaza el `Popover` de vue-libvasak 2.2.0, y hasta entonces
 * sólo cambió el nombre de su radio y de su sombra por los de la escala, y
 * dejó de pasarse del borde en una ventana más angosta que él.
 *
 * El fondo cierra el panel al hacer clic afuera, que es lo que la mano espera
 * de algo que se abrió con un clic. Lo dice acá y no arriba de la raíz de la
 * plantilla: un comentario ahí la vuelve un fragmento.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { Checkbox, SegmentedControl, type SegmentedOption } from '@vasakgroup/vue-libvasak';
import { computed, onMounted, useTemplateRef } from 'vue';
import type { OpcionesAlGuardar } from '@/tools/al-guardar';
import { interpolar } from '@/tools/interpolar';

const props = defineProps<{
	/** Espacios por nivel; `0` es tabuladores. */
	indentWidth: number;
	lineWrap: boolean;
	saveOptions: OpcionesAlGuardar;
}>();

const emit = defineEmits<{
	indentWidth: [spaces: number];
	toggleLineWrap: [];
	saveOptions: [options: OpcionesAlGuardar];
	close: [];
}>();

const { t } = useI18n();

const panel = useTemplateRef<HTMLDivElement>('panel');

// El foco entra al abrir. Sin esto el `keydown` no llega nunca —se queda en el
// editor, que es de donde se abrió— y Escape, que es la salida que la mano busca
// de algo que se abrió encima, no hacía nada.
onMounted(() => {
	panel.value?.focus();
});

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
	return width === 0 ? t('opciones.tabulador') : interpolar(t('opciones.espacios'), width);
}

function toggle(field: keyof OpcionesAlGuardar) {
	emit('saveOptions', { ...props.saveOptions, [field]: !props.saveOptions[field] });
}
</script>

<template>
  <div
    ref="panel"
    class="absolute inset-0 z-10"
    tabindex="-1"
    @click="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div
      class="absolute right-2 bottom-8 max-h-[calc(100%-2.5rem)] w-72 max-w-[calc(100%-1rem)] overflow-y-auto rounded-corner-m border border-ui-border-strong bg-ui-bg p-3 text-sm shadow-surface-l"
      @click.stop
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
          :model-value="saveOptions.quitarEspaciosFinales"
          @change="toggle('quitarEspaciosFinales')"
        />
        <Checkbox
          :label="t('opciones.agregar_salto')"
          :model-value="saveOptions.agregarSaltoFinal"
          @change="toggle('agregarSaltoFinal')"
        />
      </div>
      <p class="mt-1 text-tx-muted text-xs">{{ t('opciones.aviso') }}</p>
    </div>
  </div>
</template>
