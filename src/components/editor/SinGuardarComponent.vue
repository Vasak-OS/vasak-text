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
 *
 * Lo dibuja la librería. Acá el foco entraba al panel y Escape cancelaba, que
 * era la mitad de lo que `aria-modal="true"` promete; lo que faltaba era que el
 * Tab no se escapara al editor de atrás y que al cerrar el foco volviera de
 * donde salió. Con tres botones y ninguna respuesta razonable por omisión, que
 * el Tab se vaya es justo lo que no puede pasar.
 *
 * El ancho propio —`max-w-md`— se va con lo demás: es más angosto que el del
 * sistema, y pisarlo desde afuera no es estable en esa dirección. Las dos
 * clases van en el mismo atributo y gana la que Tailwind haya emitido después
 * en la hoja, que sigue el orden de la escala.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { Dialog, DialogContent, DialogTitle } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import { interpolar } from '@/tools/interpolar';

const props = defineProps<{
	/** Los títulos de las pestañas con cambios. Una sola, o varias al cerrar. */
	titulos: string[];
}>();

const emit = defineEmits<{ guardar: []; descartar: []; cancelar: [] }>();

const { t } = useI18n();

const mensaje = computed(() =>
	props.titulos.length === 1
		? interpolar(t('sin_guardar.una'), props.titulos[0])
		: interpolar(t('sin_guardar.varias'), props.titulos.length)
);
</script>

<template>
  <Dialog :open="true" @update:open="emit('cancelar')">
    <DialogContent>
      <DialogTitle class="font-title text-base">{{ t('sin_guardar.titulo') }}</DialogTitle>
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
    </DialogContent>
  </Dialog>
</template>
