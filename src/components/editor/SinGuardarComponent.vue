<script lang="ts" setup>
/**
 * La pregunta antes de perder algo escrito.
 *
 * Es lo único modal de la aplicación, y lo es porque no hay ninguna respuesta
 * razonable por omisión: descartar pierde trabajo y guardar escribe un archivo
 * que quizá no se quería escribir. Las tres salidas están a la vista.
 *
 * Sirve para dos momentos: cerrar una pestaña y cerrar la ventana. El segundo
 * pregunta **una sola vez por todas** las pestañas sucias, porque encadenar
 * cinco diálogos para cerrar una ventana es su propio castigo.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, useTemplateRef } from 'vue';
import { interpolar } from '@/tools/interpolar';

const props = defineProps<{
	/** Los títulos de las pestañas con cambios. Una sola, o varias al cerrar. */
	titulos: string[];
}>();

const emit = defineEmits<{ guardar: []; descartar: []; cancelar: [] }>();

const { t } = useI18n();

const panel = useTemplateRef<HTMLDivElement>('panel');

// El foco entra al abrir, y no alcanza con el `tabindex`: sin esto el
// `keydown` no llega nunca —el foco sigue en el editor— y la tecla Escape,
// que es la salida que la mano busca de algo que tapa la pantalla, no hacía
// nada.
onMounted(() => {
	panel.value?.focus();
});

const mensaje = computed(() =>
	props.titulos.length === 1
		? interpolar(t('sin_guardar.una'), props.titulos[0])
		: interpolar(t('sin_guardar.varias'), props.titulos.length)
);
</script>

<template>
  <!-- `Escape` cancela, con el foco puesto al abrir: es lo que la mano espera
       de algo que tapa la pantalla. -->
  <div
    ref="panel"
    class="absolute inset-0 z-10 flex items-center justify-center bg-ui-bg/70 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    @keydown.esc="emit('cancelar')"
  >
    <div
      class="mx-4 w-full max-w-md rounded-corner border border-ui-border-strong bg-ui-bg p-4 shadow-lg"
    >
      <h2 class="font-title text-base text-tx-main">{{ t('sin_guardar.titulo') }}</h2>
      <p class="mt-2 text-sm text-tx-muted">{{ mensaje }}</p>

      <!-- Varias: se listan, porque «hay 4 archivos sin guardar» no dice
           cuáles, y la decisión depende de cuáles sean. -->
      <ul v-if="titulos.length > 1" class="mt-2 max-h-32 overflow-y-auto text-sm text-tx-main">
        <li v-for="titulo in titulos" :key="titulo" class="truncate">· {{ titulo }}</li>
      </ul>

      <div class="mt-4 flex justify-end gap-2 text-sm">
        <button
          type="button"
          class="rounded-corner-sm border border-ui-border-strong px-3 py-1 text-tx-main hover:bg-ui-surface"
          @click="emit('cancelar')"
        >
          {{ t('sin_guardar.cancelar') }}
        </button>
        <!-- Descartar no es el botón destacado aunque cierre más rápido: es el
             único de los tres que pierde algo. -->
        <button
          type="button"
          class="rounded-corner-sm border border-status-error/50 px-3 py-1 text-tx-main hover:bg-status-error/20"
          @click="emit('descartar')"
        >
          {{ t('sin_guardar.descartar') }}
        </button>
        <button
          type="button"
          class="rounded-corner-sm bg-primary px-3 py-1 text-tx-on-primary hover:opacity-90"
          @click="emit('guardar')"
        >
          {{ t('sin_guardar.guardar') }}
        </button>
      </div>
    </div>
  </div>
</template>
