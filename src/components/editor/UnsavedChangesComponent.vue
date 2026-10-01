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
 *
 * Los tres botones son `ActionButton`: secundario para cancelar, peligro para
 * descartar y primario para guardar, que es la respuesta que no pierde nada.
 */

import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, Dialog, DialogContent, DialogTitle } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import { interpolate } from '@/tools/interpolate';

const props = defineProps<{
	/** Los títulos de las pestañas con cambios. Una sola, o varias al cerrar. */
	titles: string[];
}>();

const emit = defineEmits<{ save: []; discard: []; cancel: [] }>();

const { t } = useI18n();

const message = computed(() =>
	props.titles.length === 1
		? interpolate(t('sin_guardar.una'), props.titles[0])
		: interpolate(t('sin_guardar.varias'), props.titles.length)
);
</script>

<template>
  <Dialog :open="true" @update:open="emit('cancel')">
    <DialogContent>
      <DialogTitle class="font-title text-base">{{ t('sin_guardar.titulo') }}</DialogTitle>
      <p class="mt-2 text-sm text-tx-muted">{{ message }}</p>

      <!-- Varias: se listan, porque «hay 4 archivos sin guardar» no dice
           cuáles, y la decisión depende de cuáles sean. -->
      <ul v-if="titles.length > 1" class="mt-2 max-h-32 overflow-y-auto text-sm text-tx-main">
        <li v-for="title in titles" :key="title" class="truncate">· {{ title }}</li>
      </ul>

      <!-- En fila y a la derecha, como antes; `flex-wrap` para que en una
           ventana angosta bajen de renglón en lugar de salirse. -->
      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <ActionButton
          variant="secondary"
          :label="t('sin_guardar.cancelar')"
          @click="emit('cancel')"
        />
        <!-- Descartar no es el destacado aunque cierre más rápido: es el único
             de los tres que pierde algo, y por eso lleva el tono de peligro. -->
        <ActionButton
          variant="danger"
          :label="t('sin_guardar.descartar')"
          @click="emit('discard')"
        />
        <ActionButton
          variant="primary"
          :label="t('sin_guardar.guardar')"
          @click="emit('save')"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
