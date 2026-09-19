/**
 * La barra de la ventana y las pestañas, ya compartidas.
 *
 * El editor tenía su propio marco de ventana y su propia fila de pestañas, con
 * el aspecto copiado de la terminal «hasta los nombres de los iconos». Copiar
 * el aspecto es lo que no aguanta: la terminal cambió y el editor no, y dos
 * ventanas del mismo escritorio dejaron de parecerse.
 *
 * Lo que se comprueba acá es el pegamento, que es donde están las decisiones
 * propias del editor: qué título muestra una pestaña sin archivo, que el punto
 * de sin guardar llegue, y —la única con lógica de verdad— que reordenar se
 * traduzca al movimiento que el store espera.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { TabBar, WindowFrame } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '@/App.vue';
import { useEditorStore } from '@/stores/editor';
import { olvidarTodo } from './dobles';

let vista: VueWrapper | null = null;

/** Abre el editor con las pestañas que diga, ya montado. */
async function abrirEditorCon(cuantas: number) {
	const editor = useEditorStore();
	vista = mount(App);
	await vista.vm.$nextTick();
	// `onMounted` abre una pestaña vacía por su cuenta; las demás se agregan acá.
	while (editor.lista.length < cuantas) editor.nueva();
	await vista.vm.$nextTick();
	return { vista, editor };
}

beforeEach(() => {
	// La tienda se pide **antes** de montar: pedida después, el componente ya
	// tomó la de la prueba anterior y las dos dejan de ser la misma.
	setActivePinia(createPinia());
});

afterEach(() => {
	vista?.unmount();
	vista = null;
	olvidarTodo();
});

describe('la ventana', () => {
	test('usa el marco compartido', async () => {
		const { vista: ventana } = await abrirEditorCon(1);

		expect(ventana.findComponent(WindowFrame).exists()).toBe(true);
	});

	test('y no queda un segundo borde dibujado a mano', async () => {
		const { vista: ventana } = await abrirEditorCon(1);

		expect(ventana.findAll('.rounded-corner-window').length).toBe(1);
	});

	test('con los tres botones, porque cerrar pregunta antes', async () => {
		// El editor no es un cuadro de diálogo: se cierra. Y cerrarlo con algo
		// sin guardar no pierde nada, porque `onCloseRequested` lo intercepta.
		const { vista: ventana } = await abrirEditorCon(1);

		expect(ventana.findComponent(WindowFrame).props('controls')).toEqual([
			'minimize',
			'maximize',
			'close',
		]);
	});
});

describe('las pestañas', () => {
	test('son las de la librería y no una copia', async () => {
		const { vista: ventana } = await abrirEditorCon(1);

		expect(ventana.findComponent(TabBar).exists()).toBe(true);
	});

	test('una sin archivo se llama «sin título» y no queda en blanco', async () => {
		const { vista: ventana } = await abrirEditorCon(1);

		expect(ventana.findComponent(TabBar).props('tabs')[0].label).toBe(
			'pestanas.nueva_titulo'
		);
	});

	test('todas se pueden cerrar, incluso la última', async () => {
		// A diferencia de la terminal, que esconde el botón cuando queda una:
		// acá cerrar el último archivo abierto es algo que se pide de verdad, y
		// deja una pestaña vacía en su lugar.
		const { vista: ventana } = await abrirEditorCon(1);

		expect(ventana.findComponent(TabBar).props('tabs')[0].closable).toBe(true);
	});

	test('el punto de sin guardar llega a la pestaña', async () => {
		const { vista: ventana, editor } = await abrirEditorCon(1);

		editor.marcarSucio(editor.lista[0].id, true);
		await ventana.vm.$nextTick();

		expect(ventana.findComponent(TabBar).props('tabs')[0].dirty).toBe(true);
	});
});

describe('reordenar', () => {
	test('la lista nueva se traduce al movimiento que el store espera', async () => {
		// La barra compartida emite la lista ya reordenada; el store guarda un
		// `mover(desde, hasta)`, que es lo que sostienen las pruebas de
		// `tools/pestanas` —cuál queda activa después de mover es la parte
		// difícil, y no se reimplementa acá—.
		const { vista: ventana, editor } = await abrirEditorCon(3);
		const [a, b, c] = editor.lista.map((pestana) => pestana.id);

		const barra = ventana.findComponent(TabBar);
		const reordenadas = barra.props('tabs');
		// La primera al final, que es el arrastre más largo posible.
		barra.vm.$emit('reorder', [reordenadas[1], reordenadas[2], reordenadas[0]]);
		await ventana.vm.$nextTick();

		expect(editor.lista.map((pestana) => pestana.id)).toEqual([b, c, a]);
	});

	test('y también al revés: la última al principio', async () => {
		// El caso que el primer intento erraba. `[a, b, c] → [c, a, b]` tiene su
		// primer índice distinto en 0, y de ahí sale `mover(0, 1)`, que deja
		// `[b, a, c]`: ni la pestaña que se arrastró ni el lugar donde se
		// soltó. No da ningún error; la fila simplemente queda en otro orden que
		// el que la mano dejó.
		const { vista: ventana, editor } = await abrirEditorCon(3);
		const [a, b, c] = editor.lista.map((pestana) => pestana.id);

		const barra = ventana.findComponent(TabBar);
		const pestanas = barra.props('tabs');
		barra.vm.$emit('reorder', [pestanas[2], pestanas[0], pestanas[1]]);
		await ventana.vm.$nextTick();

		expect(editor.lista.map((pestana) => pestana.id)).toEqual([c, a, b]);
	});

	test('y una del medio a un costado', async () => {
		// Ni el origen ni el destino son un extremo: es el arrastre corriente.
		const { vista: ventana, editor } = await abrirEditorCon(4);
		const ids = editor.lista.map((pestana) => pestana.id);

		const barra = ventana.findComponent(TabBar);
		const pestanas = barra.props('tabs');
		barra.vm.$emit('reorder', [pestanas[0], pestanas[2], pestanas[1], pestanas[3]]);
		await ventana.vm.$nextTick();

		expect(editor.lista.map((pestana) => pestana.id)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
	});

	test('una lista igual no mueve nada', async () => {
		// Arrastrar una pestaña y soltarla donde estaba no tiene que tocar nada.
		const { vista: ventana, editor } = await abrirEditorCon(3);
		const antes = editor.lista.map((pestana) => pestana.id);

		const barra = ventana.findComponent(TabBar);
		barra.vm.$emit('reorder', [...barra.props('tabs')]);
		await ventana.vm.$nextTick();

		expect(editor.lista.map((pestana) => pestana.id)).toEqual(antes);
	});
});
