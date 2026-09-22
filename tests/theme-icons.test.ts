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

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { olvidarLosIconosDelTema } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import AvisoComponent from '@/components/editor/AvisoComponent.vue';
import { emit, olvidarTodo, setThemeIcon } from './dobles';

/** Deja que terminen las promesas encadenadas del pedido del icono. */
async function settle(rounds = 8) {
	for (let i = 0; i < rounds; i++) {
		await nextTick();
		await new Promise((done) => setTimeout(done, 0));
	}
}

/**
 * Lo mismo, esperando además a que el planificador recargue.
 *
 * Desde la 1.3.0 el cambio de tema no vuelve a pedir en el acto: vacía la
 * memoria y **agenda** la recarga, para que el anuncio del tema de iconos y el
 * de GTK no disparen dos barridos.
 */
async function settleWithReload() {
	await new Promise((done) => setTimeout(done, 150));
	await settle();
}

const AVISO = {
	id: 'uno',
	tipo: 'cambio-externo' as const,
	ruta: '/home/pato/notas.txt',
};

let mounted: VueWrapper | null = null;

function mountNotice() {
	mounted = mount(AvisoComponent, { props: { aviso: AVISO } });
	return mounted;
}

beforeEach(() => {
	olvidarTodo();
	// La memoria de la librería vive en su módulo y sobrevive entre archivos de
	// prueba: sin vaciarla, esto ve el icono que dejó otra.
	olvidarLosIconosDelTema();
});

afterEach(() => {
	mounted?.unmount();
	mounted = null;
	olvidarLosIconosDelTema();
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
		await settleWithReload();

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
		await settle();

		expect(aviso.get('img').attributes('src')).not.toBe('data:image/svg+xml,cruz-oscura');

		await settleWithReload();
		expect(aviso.get('img').attributes('src')).toBe('data:image/svg+xml,cruz-oscura');
	});
});
