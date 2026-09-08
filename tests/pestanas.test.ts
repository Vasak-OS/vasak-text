import { describe, expect, test } from 'bun:test';
import {
	abrir,
	activaDe,
	activar,
	actualizar,
	anterior,
	buscar,
	cerrar,
	mover,
	nuevoId,
	type Pestanas,
	siguiente,
	sucias,
	titulos,
	vacio,
} from '../src/tools/pestanas';

/**
 * Las pestañas son casi todas decisiones que se equivocan calladas: cuál queda
 * activa al cerrar, qué pasa al cerrar la última, si arrastrar cambia la
 * selección. Ninguna de esas falla con un error; simplemente hace otra cosa que
 * la que la mano esperaba, y se descubre usándolo.
 */

const con = (...nombres: string[]): Pestanas<{ ruta: string }> => {
	let estado = vacio<{ ruta: string }>();
	for (const nombre of nombres) {
		estado = abrir(estado, {
			id: nombre,
			titulo: nombre,
			sucio: false,
			datos: { ruta: `/tmp/${nombre}` },
		});
	}
	return estado;
};

const ids = <D>(estado: Pestanas<D>) => estado.lista.map((p) => p.id);

describe('abrir y activar', () => {
	test('la que se abre queda activa', () => {
		expect(con('a', 'b').activa).toBe('b');
	});

	test('sin pestañas no hay activa', () => {
		expect(activaDe(vacio())).toBeNull();
	});

	test('activar algo que no está no cambia nada', () => {
		// Si dejara la activa apuntando a un `id` inexistente, la aplicación
		// quedaba sin nada seleccionado y sin forma de volver.
		const estado = con('a', 'b');
		expect(activar(estado, 'no-existe').activa).toBe('b');
	});

	test('los identificadores no se repiten', () => {
		// Ni la ruta ni la hora sirven de `id`: la ruta se repite si se abre dos
		// veces el mismo archivo, y `Date.now()` si se abren varias pestañas en
		// el mismo milisegundo, que es lo que pasa al abrir una selección.
		const generados = new Set([nuevoId(), nuevoId(), nuevoId()]);
		expect(generados.size).toBe(3);
	});
});

describe('cerrar', () => {
	test('al cerrar la activa pasa a la de la derecha', () => {
		// Lo que hace la mano: cerrar tres seguidas con el mismo clic recorre la
		// fila, en lugar de saltar al principio cada vez.
		const estado = activar(con('a', 'b', 'c'), 'b');
		expect(cerrar(estado, 'b').activa).toBe('c');
	});

	test('al cerrar la última de la fila pasa a la de la izquierda', () => {
		const estado = con('a', 'b', 'c');
		expect(cerrar(estado, 'c').activa).toBe('b');
	});

	test('cerrar una que no es la activa no cambia la activa', () => {
		// El que se rompe callado al seguir la activa por su posición: cerrar la
		// primera corre a todas las demás un lugar.
		const estado = activar(con('a', 'b', 'c'), 'c');
		const despues = cerrar(estado, 'a');

		expect(despues.activa).toBe('c');
		expect(ids(despues)).toEqual(['b', 'c']);
	});

	test('cerrar la única deja la lista sin activa', () => {
		const despues = cerrar(con('a'), 'a');
		expect(despues.lista).toEqual([]);
		expect(despues.activa).toBeNull();
	});

	test('cerrar algo que no está no hace nada', () => {
		const estado = con('a', 'b');
		expect(cerrar(estado, 'z')).toBe(estado);
	});
});

describe('moverse por la fila', () => {
	test('siguiente y anterior recorren en orden', () => {
		const estado = activar(con('a', 'b', 'c'), 'a');
		expect(siguiente(estado).activa).toBe('b');
		expect(anterior(activar(estado, 'b')).activa).toBe('a');
	});

	test('da la vuelta en los dos extremos', () => {
		// El de la izquierda es el que se rompe: en JavaScript `-1 % 3` es `-1`,
		// así que sin corregir el signo el índice quedaba fuera de la lista y la
		// activa pasaba a `undefined`.
		expect(siguiente(activar(con('a', 'b', 'c'), 'c')).activa).toBe('a');
		expect(anterior(activar(con('a', 'b', 'c'), 'a')).activa).toBe('c');
	});

	test('con una sola pestaña se queda en ella', () => {
		expect(siguiente(con('a')).activa).toBe('a');
		expect(anterior(con('a')).activa).toBe('a');
	});

	test('sin pestañas no hace nada', () => {
		expect(siguiente(vacio()).activa).toBeNull();
	});
});

describe('reordenar arrastrando', () => {
	test('la pestaña va a la posición pedida', () => {
		expect(ids(mover(con('a', 'b', 'c'), 0, 2))).toEqual(['b', 'c', 'a']);
		expect(ids(mover(con('a', 'b', 'c'), 2, 0))).toEqual(['c', 'a', 'b']);
	});

	test('arrastrar no cambia cuál está seleccionada', () => {
		// La activa se sigue por `id` justamente por esto.
		const estado = activar(con('a', 'b', 'c'), 'a');
		expect(mover(estado, 0, 2).activa).toBe('a');
	});

	test('las posiciones fuera de la lista no hacen nada', () => {
		const estado = con('a', 'b');
		expect(mover(estado, 0, 5)).toBe(estado);
		expect(mover(estado, -1, 0)).toBe(estado);
		expect(mover(estado, 1, 1)).toBe(estado);
	});
});

describe('cambios sin guardar', () => {
	test('las sucias se pueden contar para preguntar una sola vez', () => {
		let estado = con('a', 'b', 'c');
		estado = actualizar(estado, 'a', (p) => ({ ...p, sucio: true }));
		estado = actualizar(estado, 'c', (p) => ({ ...p, sucio: true }));

		expect(sucias(estado).map((p) => p.id)).toEqual(['a', 'c']);
	});

	test('sin ninguna sucia no hay nada que preguntar', () => {
		expect(sucias(con('a', 'b'))).toEqual([]);
	});
});

describe('no se modifica el estado que entra', () => {
	test('cada operación devuelve uno nuevo', () => {
		// Vue recalcula los `computed` sobre este estado; mutarlo dejaría la
		// segunda pasada trabajando sobre lo ya cambiado.
		const estado = con('a', 'b');
		const original = ids(estado);

		cerrar(estado, 'a');
		mover(estado, 0, 1);
		actualizar(estado, 'a', (p) => ({ ...p, sucio: true }));

		expect(ids(estado)).toEqual(original);
		expect(estado.lista[0].sucio).toBe(false);
	});
});

describe('buscar una ya abierta', () => {
	test('encuentra la que apunta al mismo archivo', () => {
		// Sin esto, abrir dos veces el mismo archivo daba dos pestañas con dos
		// versiones del mismo texto, y la que se guardara segunda pisaba a la
		// otra sin avisar.
		const estado = con('a', 'b');
		expect(buscar(estado, (d) => d.ruta === '/tmp/b')?.id).toBe('b');
		expect(buscar(estado, (d) => d.ruta === '/tmp/z')).toBeNull();
	});
});

describe('los títulos de la fila', () => {
	test('cada archivo se muestra por su nombre', () => {
		expect(titulos(['/home/pato/notas.md', '/etc/hosts'])).toEqual(['notas.md', 'hosts']);
	});

	test('dos archivos con el mismo nombre se distinguen por su directorio', () => {
		// Abrir el `mod.rs` de dos módulos daba dos pestañas que decían `mod.rs`
		// y no había forma de saber cuál era cuál más que probando.
		expect(titulos(['/src/red/mod.rs', '/src/disco/mod.rs'])).toEqual([
			'red/mod.rs',
			'disco/mod.rs',
		]);
	});

	test('sólo se alarga el que se repite', () => {
		// Hacerlo siempre llenaría la fila de rutas largas para resolver un
		// problema que casi nunca está.
		expect(titulos(['/src/red/mod.rs', '/src/disco/mod.rs', '/src/main.rs'])).toEqual([
			'red/mod.rs',
			'disco/mod.rs',
			'main.rs',
		]);
	});

	test('una pestaña sin archivo no se desambigua', () => {
		// No hay ruta con la que hacerlo; se queda con el nombre que le pone la
		// interfaz.
		expect(titulos([null, '/tmp/a.txt'])).toEqual(['', 'a.txt']);
	});

	test('un archivo en la raíz no inventa un directorio', () => {
		expect(titulos(['/hosts', '/etc/hosts'])).toEqual(['hosts', 'etc/hosts']);
	});
});
