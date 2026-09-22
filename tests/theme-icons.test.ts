/**
 * Los iconos siguen al tema, y la recarga va por el planificador.
 *
 * El editor no resuelve ningún icono: los pide por nombre a `ThemeIcon`. Lo que
 * se comprueba acá es que esa cadena esté **conectada de verdad** —que al
 * cambiar el tema el dibujo cambie— y que la recarga llegue por el planificador
 * de la librería y no en el acto.
 *
 * Importa porque hasta este cambio no era así, y nada lo decía: el manifiesto
 * pedía `^1.0.0`, que admite la 1.4.0, pero `bun.lock` había quedado en la
 * 1.0.0 y se empaquetaba ésa. Un rango corregido no mueve el candado, así que
 * el editor venía con la librería de antes del planificador sin que ninguna
 * prueba ni el CI dijeran nada.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { olvidarLosIconosDelTema } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import AvisoComponent from '@/components/editor/AvisoComponent.vue';
import type { Aviso } from '@/stores/editor';
import { emit, olvidarTodo, setThemeIcon } from './dobles';

/**
 * Deja que terminen las promesas encadenadas del pedido del icono.
 *
 * Sólo microtareas: con el reloj detenido, un `setTimeout(0)` no vuelve nunca.
 */
async function settle(rounds = 8) {
	for (let i = 0; i < rounds; i++) {
		await nextTick();
		await Promise.resolve();
	}
}

/**
 * Adelanta el reloj hasta pasada la espera del planificador, y asienta.
 *
 * Con temporizadores falsos y no con una espera de verdad. Las dos cosas que
 * hay que comprobar acá se pelean: que la recarga **todavía no** pasó justo
 * después del evento, y que **sí** pasa un poco más tarde. Con el reloj real la
 * primera falla de a ratos —si la máquina se demora, los 100 ms se cumplen
 * antes de la aserción— y con sólo un `nextTick` la segunda se vuelve vacía:
 * sin planificador la recarga tampoco llega a verse, así que la prueba pasaría
 * con la librería vieja. Comprobado: pasa.
 *
 * Con el reloj detenido no hay carrera. Se avanza a mano y en dos pasos,
 * porque el planificador `await`ea entre tandas y las microtareas tienen que
 * poder correr en el medio.
 */
async function advancePastReload() {
	for (let i = 0; i < 8; i++) {
		jest.advanceTimersByTime(40);
		await settle(2);
	}
}

/** El aviso de que el archivo cambió en el disco, que es el que dibuja la cruz. */
const AVISO: Aviso = {
	tipo: 'cambio-en-disco',
	id: 'uno',
	ruta: '/home/pato/notas.txt',
};

let mounted: VueWrapper | null = null;

function mountNotice() {
	mounted = mount(AvisoComponent, { props: { aviso: AVISO } });
	return mounted;
}

beforeEach(() => {
	jest.useFakeTimers();
	olvidarTodo();
	// La memoria de la librería vive en su módulo y sobrevive entre archivos de
	// prueba: sin vaciarla, esto ve el icono que dejó otra.
	olvidarLosIconosDelTema();
});

afterEach(() => {
	mounted?.unmount();
	mounted = null;
	olvidarLosIconosDelTema();
	jest.useRealTimers();
});

describe('el aviso dibuja su cruz con el icono del tema', () => {
	test('la pide por nombre y en la variante monocroma', async () => {
		setThemeIcon('window-close', 'data:image/svg+xml,cruz-clara');

		const aviso = mountNotice();
		await settle();

		expect(aviso.get('img').attributes('src')).toBe('data:image/svg+xml,cruz-clara');
	});

	test('y al cambiar el tema le cambia el dibujo', async () => {
		// Esto ya funcionaba con la 1.0.0 —comprobado instalándola: la prueba
		// pasa igual—, así que no es lo que trae este cambio. Está porque es la
		// promesa de fondo del icono por nombre, y la que rompería de verdad
		// alguien que volviera a resolver la ruta a mano.
		setThemeIcon('window-close', 'data:image/svg+xml,cruz-clara');

		const aviso = mountNotice();
		await settle();
		expect(aviso.get('img').attributes('src')).toBe('data:image/svg+xml,cruz-clara');

		setThemeIcon('window-close', 'data:image/svg+xml,cruz-oscura');
		await emit('vicons:theme-changed');
		await advancePastReload();

		expect(aviso.get('img').attributes('src')).toBe('data:image/svg+xml,cruz-oscura');
	});

	test('la recarga se agenda, no pasa en el acto', async () => {
		// **Ésta** es la que separa la 1.0.0 de la 1.4.0, y la única de las tres
		// que falla con la versión que se venía empaquetando: sin planificador
		// el dibujo nuevo ya estaría acá; con él, todavía no. Es lo que permite
		// que una ráfaga de anuncios —el tema de iconos y el de GTK llegan
		// juntos— no dispare dos barridos, y lo que hace que en una lista larga
		// se recargue primero lo que se ve.
		setThemeIcon('window-close', 'data:image/svg+xml,cruz-clara');

		const aviso = mountNotice();
		await settle();

		setThemeIcon('window-close', 'data:image/svg+xml,cruz-oscura');
		await emit('vicons:theme-changed');
		// Todas las microtareas que quieran, sin mover el reloj: así el camino
		// **sin** planificador —que resuelve con promesas y nada más— llega a
		// terminar, y la aserción de abajo dice algo. Con el reloj detenido no
		// hay forma de que se cumplan los 100 ms por accidente.
		await settle();

		expect(aviso.get('img').attributes('src')).not.toBe('data:image/svg+xml,cruz-oscura');

		await advancePastReload();
		expect(aviso.get('img').attributes('src')).toBe('data:image/svg+xml,cruz-oscura');
	});
});
