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
import { ActionButton, Popover, TabBar, WindowFrame } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '@/App.vue';
import { useEditorStore } from '@/stores/editor';
import { olvidarTodo } from './dobles';

let view: VueWrapper | null = null;

/** Abre el editor con las pestañas que diga, ya montado. */
async function openEditorWith(count: number) {
	const editor = useEditorStore();
	view = mount(App);
	await view.vm.$nextTick();
	// `onMounted` abre una pestaña vacía por su cuenta; las demás se agregan acá.
	while (editor.lista.length < count) editor.nueva();
	await view.vm.$nextTick();
	return { view, editor };
}

beforeEach(() => {
	// La tienda se pide **antes** de montar: pedida después, el componente ya
	// tomó la de la prueba anterior y las dos dejan de ser la misma.
	setActivePinia(createPinia());
});

afterEach(() => {
	view?.unmount();
	view = null;
	olvidarTodo();
});

describe('la ventana', () => {
	test('usa el marco compartido', async () => {
		const { view: frame } = await openEditorWith(1);

		expect(frame.findComponent(WindowFrame).exists()).toBe(true);
	});

	test('y no queda un segundo borde dibujado a mano', async () => {
		const { view: frame } = await openEditorWith(1);

		expect(frame.findAll('.rounded-corner-window')).toHaveLength(1);
	});

	test('con los tres botones, porque cerrar pregunta antes', async () => {
		// El editor no es un cuadro de diálogo: se cierra. Y cerrarlo con algo
		// sin guardar no pierde nada, porque `onCloseRequested` lo intercepta.
		const { view: frame } = await openEditorWith(1);

		expect(frame.findComponent(WindowFrame).props('controls')).toEqual([
			'minimize',
			'maximize',
			'close',
		]);
	});
});

describe('las acciones de la barra', () => {
	test('son tres botones fantasma de la librería, con icono del tema y nombre', async () => {
		// Eran tres `<button>` con su borde y su fondo dibujados a mano.
		const { view: frame } = await openEditorWith(1);
		const buttons = frame.findAllComponents(ActionButton).filter((b) => b.props('icon'));

		expect(
			buttons.map((b) => [b.props('icon'), b.props('variant'), b.props('size'), b.props('iconAlt')])
		).toEqual([
			['edit-find', 'ghost', 'sm', 'acciones.buscar'],
			['document-open', 'ghost', 'sm', 'acciones.abrir'],
			['document-save', 'ghost', 'sm', 'acciones.guardar'],
		]);
		// Sólo icono: el nombre accesible es el de `iconAlt`.
		expect(buttons.map((b) => b.attributes('aria-label'))).toEqual([
			'acciones.buscar',
			'acciones.abrir',
			'acciones.guardar',
		]);
	});
});

describe('el globo de opciones, armado en la ventana', () => {
	test('el resumen de la barra de estado lo abre y lo cierra', async () => {
		// Lo que las pruebas de `library-adoption` arman a mano está acá de
		// verdad: el `Popover` envuelve la barra y el panel, atado a la ventana.
		const { view: frame } = await openEditorWith(1);
		const popover = frame.findComponent(Popover);
		expect(popover.exists()).toBe(true);
		expect(popover.props('open')).toBe(false);

		const trigger = frame
			.findAllComponents(ActionButton)
			.find((b) => b.props('title') === 'opciones.titulo');
		expect(trigger?.attributes('aria-haspopup')).toBe('dialog');

		await trigger?.trigger('click');
		expect(popover.props('open')).toBe(true);
		expect(trigger?.attributes('aria-expanded')).toBe('true');

		await trigger?.trigger('click');
		expect(popover.props('open')).toBe(false);
	});
});

describe('las pestañas', () => {
	test('son las de la librería y no una copia', async () => {
		const { view: frame } = await openEditorWith(1);

		expect(frame.findComponent(TabBar).exists()).toBe(true);
	});

	test('una sin archivo se llama «sin título» y no queda en blanco', async () => {
		const { view: frame } = await openEditorWith(1);

		expect(frame.findComponent(TabBar).props('tabs')[0].label).toBe(
			'pestanas.nueva_titulo'
		);
	});

	test('todas se pueden cerrar, incluso la última', async () => {
		// A diferencia de la terminal, que esconde el botón cuando queda una:
		// acá cerrar el último archivo abierto es algo que se pide de verdad, y
		// deja una pestaña vacía en su lugar.
		const { view: frame } = await openEditorWith(1);

		expect(frame.findComponent(TabBar).props('tabs')[0].closable).toBe(true);
	});

	test('el punto de sin guardar llega a la pestaña', async () => {
		const { view: frame, editor } = await openEditorWith(1);

		editor.marcarSucio(editor.lista[0].id, true);
		await frame.vm.$nextTick();

		expect(frame.findComponent(TabBar).props('tabs')[0].dirty).toBe(true);
	});
});

describe('reordenar', () => {
	test('la lista nueva se traduce al movimiento que el store espera', async () => {
		// La barra compartida emite la lista ya reordenada; el store guarda un
		// `mover(desde, hasta)`, que es lo que sostienen las pruebas de
		// `tools/pestanas` —cuál queda activa después de mover es la parte
		// difícil, y no se reimplementa acá—.
		const { view: frame, editor } = await openEditorWith(3);
		const [a, b, c] = editor.lista.map((tab) => tab.id);

		const bar = frame.findComponent(TabBar);
		const reordered = bar.props('tabs');
		// La primera al final, que es el arrastre más largo posible.
		bar.vm.$emit('reorder', [reordered[1], reordered[2], reordered[0]]);
		await frame.vm.$nextTick();

		expect(editor.lista.map((tab) => tab.id)).toEqual([b, c, a]);
	});

	test('y también al revés: la última al principio', async () => {
		// El caso que el primer intento erraba. `[a, b, c] → [c, a, b]` tiene su
		// primer índice distinto en 0, y de ahí sale `mover(0, 1)`, que deja
		// `[b, a, c]`: ni la pestaña que se arrastró ni el lugar donde se
		// soltó. No da ningún error; la fila simplemente queda en otro orden que
		// el que la mano dejó.
		const { view: frame, editor } = await openEditorWith(3);
		const [a, b, c] = editor.lista.map((tab) => tab.id);

		const bar = frame.findComponent(TabBar);
		const tabs = bar.props('tabs');
		bar.vm.$emit('reorder', [tabs[2], tabs[0], tabs[1]]);
		await frame.vm.$nextTick();

		expect(editor.lista.map((tab) => tab.id)).toEqual([c, a, b]);
	});

	test('y una del medio a un costado', async () => {
		// Ni el origen ni el destino son un extremo: es el arrastre corriente.
		const { view: frame, editor } = await openEditorWith(4);
		const ids = editor.lista.map((tab) => tab.id);

		const bar = frame.findComponent(TabBar);
		const tabs = bar.props('tabs');
		bar.vm.$emit('reorder', [tabs[0], tabs[2], tabs[1], tabs[3]]);
		await frame.vm.$nextTick();

		expect(editor.lista.map((tab) => tab.id)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
	});

	test('una lista igual no mueve nada', async () => {
		// Arrastrar una pestaña y soltarla donde estaba no tiene que tocar nada.
		const { view: frame, editor } = await openEditorWith(3);
		const before = editor.lista.map((tab) => tab.id);

		const bar = frame.findComponent(TabBar);
		bar.vm.$emit('reorder', [...bar.props('tabs')]);
		await frame.vm.$nextTick();

		expect(editor.lista.map((tab) => tab.id)).toEqual(before);
	});
});
