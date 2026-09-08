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
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onMounted, useTemplateRef } from 'vue';
import type { OpcionesAlGuardar } from '@/tools/al-guardar';
import { interpolar } from '@/tools/interpolar';

const props = defineProps<{
	/** Espacios por nivel; `0` es tabuladores. */
	indentacion: number;
	ajusteLinea: boolean;
	alGuardar: OpcionesAlGuardar;
}>();

const emit = defineEmits<{
	indentacion: [espacios: number];
	alternarAjuste: [];
	alGuardar: [opciones: OpcionesAlGuardar];
	cerrar: [];
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
const ANCHOS = [0, 2, 4, 8];

function etiqueta(ancho: number): string {
	return ancho === 0 ? t('opciones.tabulador') : interpolar(t('opciones.espacios'), ancho);
}

function cambiar(campo: keyof OpcionesAlGuardar) {
	emit('alGuardar', { ...props.alGuardar, [campo]: !props.alGuardar[campo] });
}
</script>

<template>
  <!-- El fondo cierra el panel al hacer clic afuera, que es lo que la mano
       espera de algo que se abrió con un clic. -->
  <div
    ref="panel"
    class="absolute inset-0 z-10"
    tabindex="-1"
    @click="emit('cerrar')"
    @keydown.esc="emit('cerrar')"
  >
    <div
      class="absolute right-2 bottom-8 w-72 rounded-corner border border-ui-border-strong bg-ui-bg p-3 text-sm shadow-lg"
      @click.stop
    >
      <h2 class="font-title text-tx-main">{{ t('opciones.titulo') }}</h2>

      <p class="mt-3 text-tx-muted text-xs">{{ t('opciones.indentacion') }}</p>
      <div class="mt-1 flex gap-1">
        <button
          v-for="ancho in ANCHOS"
          :key="ancho"
          type="button"
          class="flex-1 rounded-corner-sm border px-1 py-0.5 text-xs"
          :class="indentacion === ancho
            ? 'border-primary bg-primary/20 text-tx-main'
            : 'border-ui-border-strong text-tx-muted hover:bg-ui-surface'"
          @click="emit('indentacion', ancho)"
        >
          {{ ancho === 0 ? t('opciones.tabulador') : ancho }}
        </button>
      </div>
      <p class="mt-1 text-tx-muted text-xs">{{ etiqueta(indentacion) }}</p>

      <label class="mt-3 flex cursor-pointer items-center gap-2 text-tx-main">
        <input type="checkbox" :checked="ajusteLinea" @change="emit('alternarAjuste')">
        <span>{{ t('estado.ajuste_linea') }}</span>
      </label>

      <p class="mt-3 text-tx-muted text-xs">{{ t('opciones.al_guardar') }}</p>
      <label class="mt-1 flex cursor-pointer items-start gap-2 text-tx-main">
        <input
          type="checkbox"
          class="mt-1"
          :checked="alGuardar.quitarEspaciosFinales"
          @change="cambiar('quitarEspaciosFinales')"
        >
        <span>{{ t('opciones.quitar_espacios') }}</span>
      </label>
      <label class="mt-1 flex cursor-pointer items-start gap-2 text-tx-main">
        <input
          type="checkbox"
          class="mt-1"
          :checked="alGuardar.agregarSaltoFinal"
          @change="cambiar('agregarSaltoFinal')"
        >
        <span>{{ t('opciones.agregar_salto') }}</span>
      </label>
      <p class="mt-1 text-tx-muted text-xs">{{ t('opciones.aviso') }}</p>
    </div>
  </div>
</template>
