<script lang="ts" setup>
/**
 * La fila de pestañas, con el aspecto de las de la terminal.
 *
 * **No sabe qué hay en una pestaña.** Recibe títulos, cuál está activa y quién
 * tiene cambios sin guardar, y avisa lo que la mano hizo. Eso es a propósito: la
 * terminal y el gestor de archivos ya tienen dos copias de este componente que
 * difieren en detalles, y las dos saben de más —una de directorios, la otra de
 * procesos—. Escrito así, este archivo se puede mover a un paquete compartido
 * sin arrastrar nada del editor.
 *
 * El aspecto, en cambio, **sí se copia de la terminal**, hasta los nombres de los
 * iconos: mismo ancho fijo, mismo radio, la activa en el color primario y la
 * inactiva translúcida. Que dos aplicaciones del mismo escritorio tengan pestañas
 * distintas se nota apenas se ponen una al lado de la otra.
 *
 * Ver el encabezado de `tools/pestanas.ts`.
 */

import { onBeforeUnmount, ref } from 'vue';
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

// Los mismos nombres que usa la terminal, para que sean los mismos dibujos.
const { nuevaIcon, cerrarIcon } = useReactiveIcons({
	nuevaIcon: 'gtk-add',
	cerrarIcon: 'gtk-close',
});

/** Desde qué posición se está arrastrando, o `null` si no se arrastra nada. */
const arrastrando = ref<number | null>(null);
/** Sobre qué posición está el puntero, para marcar dónde va a caer. */
const encima = ref<number | null>(null);

const carril = ref<HTMLDivElement | null>(null);

/**
 * La rueda del mouse mueve la fila en horizontal.
 *
 * Con muchos archivos abiertos la fila desborda, y sobre una fila horizontal el
 * gesto que la mano hace es girar la rueda: sin esto no pasaba nada y había que
 * ir a buscar la barra de desplazamiento. Es lo mismo que hace la terminal.
 */
function rueda(evento: WheelEvent) {
	const elemento = carril.value;
	if (elemento === null) return;
	elemento.scrollLeft += evento.deltaY || evento.deltaX || 0;
}

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

onBeforeUnmount(terminarArrastre);
</script>

<template>
  <div class="flex h-full min-w-0 items-center gap-1">
    <!-- El carril desborda y se desplaza; el botón de nueva se queda afuera
         para que no se vaya de la vista con las pestañas. -->
    <div
      ref="carril"
      class="flex min-w-0 items-center gap-1 overflow-x-auto"
      @wheel.prevent="rueda"
    >
      <div
        v-for="(pestana, indice) in pestanas"
        :key="pestana.id"
        class="relative flex w-34 max-w-34 shrink-0 cursor-pointer items-center gap-1.5 rounded-corner border border-ui-border p-1 px-3"
        :class="[
          pestana.id === activa ? 'bg-primary font-bold text-tx-on-primary' : 'bg-ui-bg/80',
          encima === indice && arrastrando !== indice ? 'border-secondary' : '',
        ]"
        draggable="true"
        @click.stop="emit('activar', pestana.id)"
        @dragstart="comenzarArrastre(indice, $event)"
        @dragover="sobre(indice, $event)"
        @drop="soltar(indice)"
        @dragend="terminarArrastre"
      >
        <!-- El punto de sin guardar, antes del nombre: es lo que se busca al
             recorrer la fila con la vista, y al final se pierde entre los
             botones de cerrar. Lleva `title` porque un punto de color solo no
             dice qué significa. Toma el color del texto para que se vea tanto
             sobre la pestaña activa como sobre la inactiva. -->
        <span
          v-if="pestana.sucio"
          class="size-2 shrink-0 rounded-full bg-current"
          :title="etiquetas.sinGuardar"
        />
        <span class="w-full overflow-hidden text-ellipsis whitespace-nowrap" :title="titulo(indice)">
          {{ titulo(indice) }}
        </span>
        <!-- Siempre presente, a diferencia de la terminal, que lo esconde
             cuando queda una sola: acá cerrar el último archivo abierto es algo
             que se pide de verdad, y deja una pestaña vacía en su lugar. -->
        <button
          type="button"
          class="shrink-0"
          :title="etiquetas.cerrar"
          :aria-label="etiquetas.cerrar"
          @click.stop="emit('cerrar', pestana.id)"
        >
          <img :src="cerrarIcon" class="size-4" alt="">
        </button>
      </div>
    </div>

    <button
      type="button"
      class="flex size-5 shrink-0 items-center justify-center rounded-corner bg-primary p-1 text-tx-on-primary"
      :title="etiquetas.nueva"
      :aria-label="etiquetas.nueva"
      @click="emit('nueva')"
    >
      <img :src="nuevaIcon" class="size-3.5" alt="">
    </button>
  </div>
</template>
