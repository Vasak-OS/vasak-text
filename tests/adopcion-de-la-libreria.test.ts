/**
 * Lo que el editor dejó de dibujar por su cuenta.
 *
 * Tres cosas: el icono reactivo —noventa y una líneas para cuatro iconos—, la
 * pregunta de «hay cambios sin guardar», y la tabla de colores y roles de la
 * barra de avisos, que era una copia literal de la del sistema.
 *
 * Lo que se comprueba es lo que le faltaba al diálogo. Declaraba
 * `aria-modal="true"` y cumplía la mitad: el foco entraba y Escape cancelaba,
 * pero el Tab seguía recorriendo el editor de atrás y al cerrar el foco no
 * volvía a ningún lado. Con tres botones y ninguna respuesta razonable por
 * omisión, que el Tab se escape es justo lo que no puede pasar.
 */

import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { CLASES_POR_TONO, olvidarLosIconosDelTema } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import AvisoComponent from '@/components/editor/AvisoComponent.vue';
import SinGuardarComponent from '@/components/editor/SinGuardarComponent.vue';
import { olvidarTodo } from './dobles';

const RAIZ = new URL('..', import.meta.url).pathname;

const vistas = new Set<VueWrapper>();

function anotar<T extends VueWrapper>(vista: T): T {
	vistas.add(vista);
	return vista;
}

beforeAll(async () => {
	const calentar = mount(SinGuardarComponent, { props: { titulos: ['uno'] } });
	calentar.unmount();
}, 60_000);

afterEach(() => {
	for (const vista of vistas) vista.unmount();
	vistas.clear();
	// El diálogo se teletransporta al `body`, así que no se lo lleva el
	// desmontaje: una prueba que falla dejaría su panel puesto y la siguiente
	// encontraría **ése** al preguntar por `[role="dialog"]`.
	for (const suelto of document.body.querySelectorAll('[role="dialog"]')) {
		suelto.parentElement?.remove();
	}
	olvidarTodo();
	olvidarLosIconosDelTema();
});

const elPanel = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

/**
 * Una tecla con el foco adentro.
 *
 * `cancelable` y devolver el evento no son adorno: un evento despachado a mano
 * no hace la navegación nativa del Tab, así que el foco no se mueve solo se
 * mueva o no la trampa. Lo que distingue una cosa de la otra es que el evento
 * quede cancelado y adónde fue a parar el foco.
 */
function teclearDentro(key: string) {
	const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	elPanel()?.dispatchEvent(evento);
	return evento;
}

function preguntar(titulos = ['borrador.md']) {
	return anotar(mount(SinGuardarComponent, { props: { titulos }, attachTo: document.body }));
}

async function asentarse() {
	await nextTick();
	await nextTick();
}

describe('la pregunta de lo no guardado', () => {
	test('toma su nombre del título que se ve', async () => {
		preguntar();
		await asentarse();

		const id = elPanel()?.getAttribute('aria-labelledby');
		expect(elPanel()?.getAttribute('aria-modal')).toBe('true');
		expect(id).toBeTruthy();
		expect(document.getElementById(id as string)?.textContent).toContain('sin_guardar.titulo');
	});

	test('el foco entra, como antes', async () => {
		preguntar();
		await asentarse();

		expect(document.activeElement).toBe(elPanel());
	});

	test('y ahora el Tab da la vuelta en vez de irse al editor', async () => {
		// Es lo que faltaba. Con tres botones y ninguna respuesta razonable por
		// omisión, que el Tab se escape al texto de atrás deja la pregunta
		// abierta y sin forma de contestarla con el teclado.
		preguntar();
		await asentarse();

		const botones = [...(elPanel()?.querySelectorAll<HTMLElement>('button') ?? [])];
		expect(botones).toHaveLength(3);

		botones[botones.length - 1].focus();
		const evento = teclearDentro('Tab');
		await nextTick();

		expect(evento.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(botones[0]);
	});

	test('Escape sigue cancelando, y una sola vez', async () => {
		const vista = preguntar();
		await asentarse();

		teclearDentro('Escape');
		await nextTick();

		expect(vista.emitted('cancelar')).toHaveLength(1);
	});

	test('y al cerrarse el foco vuelve de donde salió', async () => {
		// Sin esto, contestar la pregunta deja el foco en el `body` y el teclado
		// empieza de nuevo desde arriba de la ventana.
		const antes = document.createElement('button');
		antes.className = 'el-editor';
		document.body.appendChild(antes);
		antes.focus();

		const vista = preguntar();
		await asentarse();
		expect(document.activeElement).toBe(elPanel());

		vistas.delete(vista);
		vista.unmount();
		await nextTick();

		expect(document.activeElement).toBe(antes);
		antes.remove();
	});
});

describe('la barra de avisos', () => {
	test('un error interrumpe y lo guardado espera turno', async () => {
		const error = anotar(
			mount(AvisoComponent, {
				props: { aviso: { tipo: 'ya-abierto', ruta: '/tmp/a.txt' } },
			})
		);
		const bien = anotar(mount(AvisoComponent, { props: { aviso: { tipo: 'guardado', ruta: '/tmp/a.txt' } } }));

		expect(error.attributes('role')).toBe('alert');
		expect(bien.attributes('role')).toBe('status');
	});

	test('y el color sale de la tabla del sistema, no de una copia', async () => {
		// Eran los mismos valores escritos a mano. Una copia de la tabla del
		// sistema es una copia que se separa sin que nada falle: el día que el
		// rojo del sistema cambie, el de acá se queda.
		const error = anotar(
			mount(AvisoComponent, {
				props: { aviso: { tipo: 'ya-abierto', ruta: '/tmp/a.txt' } },
			})
		);

		expect(error.classes().join(' ')).toContain(CLASES_POR_TONO.error.split(' ')[0]);
	});
});

describe('lo que el editor ya no dibuja', () => {
	test('el composable del icono se fue', async () => {
		expect(await Bun.file(`${RAIZ}src/composables/useReactiveIcon.ts`).exists()).toBe(false);
	});

	test('y nadie lo importa', async () => {
		const fuentes = [...new Bun.Glob('src/**/*.{vue,ts}').scanSync(RAIZ)];
		expect(fuentes.length).toBeGreaterThan(10);

		const culpables: string[] = [];
		for (const ruta of fuentes) {
			const texto = await Bun.file(`${RAIZ}${ruta}`).text();
			if (/useReactiveIcon/.test(texto)) culpables.push(ruta);
		}

		expect(culpables).toEqual([]);
	});
});
