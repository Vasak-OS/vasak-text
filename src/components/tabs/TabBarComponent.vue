<script lang="ts" setup>
/**
 * La fila de pestañas.
 *
 * **No sabe qué hay en una pestaña.** Recibe títulos, cuál está activa y quién
 * tiene cambios sin guardar, y avisa lo que la mano hizo. Eso es a propósito: la
 * terminal y el gestor de archivos ya tienen dos copias de este componente que
 * difieren en detalles, y las dos saben de más —una de directorios, la otra de
 * procesos—. Escrito así, este archivo se puede mover a un paquete compartido
 * sin arrastrar nada del editor.
 *
 * Ver el encabezado de `tools/pestanas.ts`.
 */

import { ref } from 'vue';
import { useReactiveIcons } from '@/composables/useReactiveIcon';

const props = defineProps<{
	pestanas: { id: string; sucio: boolean }[];
	/** Los títulos, en el mismo orden que `pestanas`. */
	titulos: string[];
	activa: string | null;
	/** Qué se muestra en una pestaña cuyo título está vacío. */
	sinTitulo: string;
	etiquetas: { nueva: string; cerrar: string; sinGuardar: string };
}>();

const emit = defineEmits<{
	activar: [id: string];
	cerrar: [id: string];
	mover: [desde: number, hasta: number];
	nueva: [];
}>();

const { nuevaIcon, cerrarIcon } = useReactiveIcons({
	nuevaIcon: 'list-add',
	cerrarIcon: 'window-close',
});

/** Desde qué posición se está arrastrando, o `null` si no se arrastra nada. */
const arrastrando = ref<number | null>(null);
/** Sobre qué posición está el puntero, para marcar dónde va a caer. */
const encima = ref<number | null>(null);

function comenzarArrastre(indice: number, evento: DragEvent) {
	arrastrando.value = indice;
	// `move` y no `copy`: el puntero muestra la flecha de mover y no el signo
	// de más, que sugiere que se va a duplicar la pestaña.
	if (evento.dataTransfer !== null) evento.dataTransfer.effectAllowed = 'move';
}

function sobre(indice: number, evento: DragEvent) {
	// `preventDefault` es lo que habilita el soltar: sin él el navegador
	// rechaza el `drop` y el arrastre no hace nada, sin ningún error.
	evento.preventDefault();
	encima.value = indice;
}

function soltar(indice: number) {
	if (arrastrando.value !== null && arrastrando.value !== indice) {
		emit('mover', arrastrando.value, indice);
	}
	arrastrando.value = null;
	encima.value = null;
}

function terminarArrastre() {
	// También cuando se suelta afuera: sin esto la marca de destino quedaba
	// pintada hasta el siguiente arrastre.
	arrastrando.value = null;
	encima.value = null;
}

function titulo(indice: number): string {
	const propio = props.titulos[indice] ?? '';
	return propio.length > 0 ? propio : props.sinTitulo;
}
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
    <div
      v-for="(pestana, indice) in pestanas"
      :key="pestana.id"
      class="group flex max-w-52 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-corner-sm border px-2 py-1 text-sm transition-colors"
      :class="[
        pestana.id === activa
          ? 'border-ui-border-strong bg-ui-surface text-tx-main'
          : 'border-transparent text-tx-muted hover:bg-ui-surface/50',
        encima === indice && arrastrando !== indice ? 'border-primary' : '',
      ]"
      draggable="true"
      @click="emit('activar', pestana.id)"
      @dragstart="comenzarArrastre(indice, $event)"
      @dragover="sobre(indice, $event)"
      @drop="soltar(indice)"
      @dragend="terminarArrastre"
    >
      <!-- El punto de sin guardar, antes del nombre: es lo que se busca al
           recorrer la fila con la vista, y al final se pierde entre los
           botones de cerrar. Lleva `title` porque un punto de color solo no
           dice qué significa. -->
      <span
        v-if="pestana.sucio"
        class="size-2 shrink-0 rounded-full bg-primary"
        :title="etiquetas.sinGuardar"
      />
      <span class="truncate">{{ titulo(indice) }}</span>
      <!-- Siempre presente y no sólo al pasar por encima: si aparece con el
           puntero, la pestaña se ensancha al acercarse y el botón se corre
           justo cuando se lo va a apretar. -->
      <button
        type="button"
        class="shrink-0 rounded-corner-sm p-0.5 opacity-50 hover:bg-status-error hover:opacity-100"
        :title="etiquetas.cerrar"
        :aria-label="etiquetas.cerrar"
        @click.stop="emit('cerrar', pestana.id)"
      >
        <img :src="cerrarIcon" class="size-3" alt="">
      </button>
    </div>

    <button
      type="button"
      class="shrink-0 rounded-corner-sm p-1 text-tx-muted hover:bg-ui-surface hover:text-tx-main"
      :title="etiquetas.nueva"
      :aria-label="etiquetas.nueva"
      @click="emit('nueva')"
    >
      <img :src="nuevaIcon" class="size-4" alt="">
    </button>
  </div>
</template>
