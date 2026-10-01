/**
 * Lo que el editor dejó de dibujar por su cuenta.
 *
 * Tres cosas: el icono reactivo —noventa y una líneas para cuatro iconos—, la
 * pregunta de «hay cambios sin guardar», y la tabla de colores y roles de la
 * barra de avisos, que era una copia literal de la del sistema.
 *
 * Con vue-libvasak 2.1 (vue-libvasak#74) se fue también lo de adentro: los
 * botones de la barra de avisos, de la de estado y de la pregunta son
 * `ActionButton`; la barra de avisos es `AlertMessage` en su variante
 * `banner`; «sólo lectura» es un `Badge`; la sangría, un `SegmentedControl`, y
 * las casillas de las opciones, `Checkbox` —casillas todavía—.
 *
 * Lo que se comprueba es lo que le faltaba al diálogo. Declaraba
 * `aria-modal="true"` y cumplía la mitad: el foco entraba y Escape cancelaba,
 * pero el Tab seguía recorriendo el editor de atrás y al cerrar el foco no
 * volvía a ningún lado. Con tres botones y ninguna respuesta razonable por
 * omisión, que el Tab se escape es justo lo que no puede pasar.
 */

import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import {
	ActionButton,
	AlertMessage,
	Badge,
	Checkbox,
	olvidarLosIconosDelTema,
	SegmentedControl,
	TONE_CLASSES,
} from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { type Component, nextTick } from 'vue';
import NoticeBarComponent from '@/components/editor/NoticeBarComponent.vue';
import OptionsComponent from '@/components/editor/OptionsComponent.vue';
import StatusBarComponent from '@/components/editor/StatusBarComponent.vue';
import UnsavedChangesComponent from '@/components/editor/UnsavedChangesComponent.vue';
import { OPCIONES_POR_OMISION } from '@/tools/al-guardar';
import { olvidarTodo } from './dobles';

const ROOT = new URL('..', import.meta.url).pathname;

const views = new Set<VueWrapper>();

function track<T extends VueWrapper>(view: T): T {
	views.add(view);
	return view;
}

beforeAll(async () => {
	const warmUp = mount(UnsavedChangesComponent, { props: { titles: ['uno'] } });
	warmUp.unmount();
}, 60_000);

afterEach(() => {
	for (const view of views) view.unmount();
	views.clear();
	// El diálogo se teletransporta al `body`, así que no se lo lleva el
	// desmontaje: una prueba que falla dejaría su panel puesto y la siguiente
	// encontraría **ése** al preguntar por `[role="dialog"]`.
	for (const leftover of document.body.querySelectorAll('[role="dialog"]')) {
		leftover.parentElement?.remove();
	}
	olvidarTodo();
	olvidarLosIconosDelTema();
});

const dialogPanel = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

/**
 * Una tecla con el foco adentro.
 *
 * `cancelable` y devolver el evento no son adorno: un evento despachado a mano
 * no hace la navegación nativa del Tab, así que el foco no se mueve solo se
 * mueva o no la trampa. Lo que distingue una cosa de la otra es que el evento
 * quede cancelado y adónde fue a parar el foco.
 */
function pressInside(key: string) {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	dialogPanel()?.dispatchEvent(event);
	return event;
}

function ask(titles = ['borrador.md']) {
	return track(mount(UnsavedChangesComponent, { props: { titles }, attachTo: document.body }));
}

async function settle() {
	await nextTick();
	await nextTick();
}

describe('la pregunta de lo no guardado', () => {
	test('toma su nombre del título que se ve', async () => {
		ask();
		await settle();

		const id = dialogPanel()?.getAttribute('aria-labelledby');
		expect(dialogPanel()?.getAttribute('aria-modal')).toBe('true');
		expect(id).toBeTruthy();
		expect(document.getElementById(id as string)?.textContent).toContain('sin_guardar.titulo');
	});

	test('el foco entra, como antes', async () => {
		ask();
		await settle();

		expect(document.activeElement).toBe(dialogPanel());
	});

	test('y ahora el Tab da la vuelta en vez de irse al editor', async () => {
		// Es lo que faltaba. Con tres botones y ninguna respuesta razonable por
		// omisión, que el Tab se escape al texto de atrás deja la pregunta
		// abierta y sin forma de contestarla con el teclado.
		ask();
		await settle();

		const buttons = [...(dialogPanel()?.querySelectorAll<HTMLElement>('button') ?? [])];
		expect(buttons).toHaveLength(3);

		buttons[buttons.length - 1].focus();
		const event = pressInside('Tab');
		await nextTick();

		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(buttons[0]);
	});

	test('Escape sigue cancelando, y una sola vez', async () => {
		const view = ask();
		await settle();

		pressInside('Escape');
		await nextTick();

		expect(view.emitted('cancel')).toHaveLength(1);
	});

	test('y al cerrarse el foco vuelve de donde salió', async () => {
		// Sin esto, contestar la pregunta deja el foco en el `body` y el teclado
		// empieza de nuevo desde arriba de la ventana.
		const before = document.createElement('button');
		before.className = 'el-editor';
		document.body.appendChild(before);
		before.focus();

		const view = ask();
		await settle();
		expect(document.activeElement).toBe(dialogPanel());

		views.delete(view);
		view.unmount();
		await nextTick();

		expect(document.activeElement).toBe(before);
		before.remove();
	});
});

describe('la barra de avisos', () => {
	const changedOnDisk = { tipo: 'cambio-en-disco', id: 'uno', ruta: '/tmp/a.txt' } as const;

	test('un error interrumpe y lo guardado espera turno', async () => {
		const error = track(
			mount(NoticeBarComponent, {
				props: { notice: { tipo: 'ya-abierto', ruta: '/tmp/a.txt' } },
			})
		);
		const fine = track(mount(NoticeBarComponent, { props: { notice: { tipo: 'guardado', ruta: '/tmp/a.txt' } } }));

		expect(error.attributes('role')).toBe('alert');
		expect(fine.attributes('role')).toBe('status');
	});

	test('es la barra de la librería, de lado a lado, y no una copia', async () => {
		// Estaba hecha a mano porque `AlertMessage` era sólo una caja
		// redondeada. La 2.1 trae la variante `banner`, que es esta barra.
		const error = track(
			mount(NoticeBarComponent, {
				props: { notice: { tipo: 'ya-abierto', ruta: '/tmp/a.txt' } },
			})
		);

		const alert = error.findComponent(AlertMessage);
		expect(alert.exists()).toBe(true);
		expect(alert.props('variant')).toBe('banner');
		expect(alert.props('tone')).toBe('error');
		expect(error.classes().join(' ')).toContain(TONE_CLASSES.error.split(' ')[0]);
	});

	test('la cruz cierra, y sólo el cambio en disco trae sus dos botones', async () => {
		const plain = track(
			mount(NoticeBarComponent, { props: { notice: { tipo: 'guardado', ruta: '/tmp/a.txt' } } })
		);
		// La cruz sola: ningún otro botón.
		expect(plain.findAllComponents(ActionButton)).toHaveLength(1);

		const changed = track(mount(NoticeBarComponent, { props: { notice: changedOnDisk } }));
		const buttons = changed.findAllComponents(ActionButton);
		expect(buttons.map((b) => b.props('label'))).toEqual(['avisos.recargar', 'avisos.guardar_igual', '']);

		await buttons[0].trigger('click');
		await buttons[1].trigger('click');
		await buttons[2].trigger('click');

		expect(changed.emitted('reload')).toEqual([['uno']]);
		expect(changed.emitted('saveAs')).toEqual([['uno']]);
		expect(changed.emitted('close')).toHaveLength(1);
	});
});

describe('la barra de estado', () => {
	const props = {
		line: 3,
		column: 7,
		path: '/tmp/a.ts',
		lineEnding: 'crlf' as const,
		readOnly: false,
		lineWrap: true,
		indentWidth: 2,
	};

	test('sus dos botones son de la librería y dicen lo mismo que antes', async () => {
		const bar = track(mount(StatusBarComponent, { props }));
		const buttons = bar.findAllComponents(ActionButton);

		expect(buttons).toHaveLength(2);
		expect(buttons.map((b) => [b.props('variant'), b.props('size')])).toEqual([
			['ghost', 'sm'],
			['ghost', 'sm'],
		]);
		expect(buttons[0].props('title')).toBe('estado.ir_a_linea');
		expect(buttons[1].props('label')).toBe('opciones.espacios · estado.ajuste_linea');

		await buttons[0].trigger('click');
		await buttons[1].trigger('click');
		expect(bar.emitted('goToLine')).toHaveLength(1);
		expect(bar.emitted('options')).toHaveLength(1);
	});

	test('«sólo lectura» es una insignia de advertencia, y sólo cuando lo es', async () => {
		const writable = track(mount(StatusBarComponent, { props }));
		expect(writable.findComponent(Badge).exists()).toBe(false);

		const readOnly = track(mount(StatusBarComponent, { props: { ...props, readOnly: true } }));
		const badge = readOnly.findComponent(Badge);
		expect(badge.exists()).toBe(true);
		expect(badge.props('tone')).toBe('warning');
		expect(badge.text()).toBe('estado.solo_lectura');
	});

	test('no crece: sin relleno vertical, porque el botón chico ya mide lo que medía la barra', async () => {
		const bar = track(mount(StatusBarComponent, { props }));
		const classes = bar.classes();

		expect(classes.some((c) => /^py-/.test(c))).toBe(false);
		expect(classes).toContain('border-t');
	});
});

describe('las opciones', () => {
	const props = { indentWidth: 4, lineWrap: false, saveOptions: { ...OPCIONES_POR_OMISION } };

	test('la sangría es un control segmentado con las mismas cuatro', async () => {
		const options = track(mount(OptionsComponent, { props, attachTo: document.body }));
		// Es genérico (`generic="T"`): sus tipos no le llegan a `findComponent`,
		// que deja sus propiedades en `never`. Lo que ofrece se lee del DOM.
		expect(options.findComponent(SegmentedControl as Component).exists()).toBe(true);

		// Un grupo de radio, con su nombre y las mismas cuatro de antes.
		const group = options.get('[role="radiogroup"]');
		expect(group.attributes('aria-label')).toBe('opciones.indentacion');
		const radios = group.findAll('[role="radio"]');
		expect(radios.map((r) => r.text())).toEqual(['opciones.tabulador', '2', '4', '8']);
		expect(radios.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
		await radios[1].trigger('click');
		expect(options.emitted('indentWidth')).toEqual([[2]]);
	});

	test('las tres siguen siendo casillas, no interruptores', async () => {
		// Cambiarlas por interruptores es cambiar la pantalla: la regla es que
		// el formato se queda.
		const options = track(mount(OptionsComponent, { props, attachTo: document.body }));
		const boxes = options.findAllComponents(Checkbox);

		expect(boxes.map((b) => b.props('label'))).toEqual([
			'estado.ajuste_linea',
			'opciones.quitar_espacios',
			'opciones.agregar_salto',
		]);
		expect(options.findAll('input[type="checkbox"]')).toHaveLength(3);
		expect(options.find('[role="switch"]').exists()).toBe(false);
	});

	test('cada casilla cambia lo suyo y nada más', async () => {
		const options = track(mount(OptionsComponent, { props, attachTo: document.body }));
		const inputs = options.findAll('input[type="checkbox"]');

		await inputs[0].setValue(true);
		expect(options.emitted('toggleLineWrap')).toHaveLength(1);

		await inputs[2].setValue(true);
		expect(options.emitted('saveOptions')).toEqual([[{ ...OPCIONES_POR_OMISION, agregarSaltoFinal: true }]]);
	});

	test('Escape y el clic afuera cierran', async () => {
		const options = track(mount(OptionsComponent, { props, attachTo: document.body }));

		await options.trigger('keydown', { key: 'Escape' });
		await options.trigger('click');
		expect(options.emitted('close')).toHaveLength(2);
	});

	test('y el panel no se sale de una ventana más angosta que él', async () => {
		// Es el panel propio que espera al `Popover` de la 2.2.0: mide 18rem, y
		// en una ventana de 240 px se cortaba del lado izquierdo.
		const options = track(mount(OptionsComponent, { props, attachTo: document.body }));
		const panel = options.get('.shadow-surface-l');

		expect(panel.classes()).toContain('max-w-[calc(100%-1rem)]');
		expect(panel.classes()).toContain('overflow-y-auto');
	});
});

describe('la pregunta de lo no guardado, por dentro', () => {
	test('cancelar, descartar y guardar, con el tono de cada uno', async () => {
		const view = ask(['a.md', 'b.md']);
		await settle();

		const buttons = view.findAllComponents(ActionButton);
		expect(buttons.map((b) => [b.props('label'), b.props('variant')])).toEqual([
			['sin_guardar.cancelar', 'secondary'],
			['sin_guardar.descartar', 'danger'],
			['sin_guardar.guardar', 'primary'],
		]);

		await buttons[1].trigger('click');
		await buttons[2].trigger('click');
		expect(view.emitted('discard')).toHaveLength(1);
		expect(view.emitted('save')).toHaveLength(1);
	});
});

describe('lo que el editor ya no dibuja', () => {
	test('el composable del icono se fue', async () => {
		expect(await Bun.file(`${ROOT}src/composables/useReactiveIcon.ts`).exists()).toBe(false);
	});

	test('y nadie lo importa', async () => {
		const sources = [...new Bun.Glob('src/**/*.{vue,ts}').scanSync(ROOT)];
		expect(sources.length).toBeGreaterThan(10);

		const culprits: string[] = [];
		for (const path of sources) {
			const text = await Bun.file(`${ROOT}${path}`).text();
			if (/useReactiveIcon/.test(text)) culprits.push(path);
		}

		expect(culprits).toEqual([]);
	});
});
