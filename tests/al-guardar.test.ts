import { describe, expect, test } from 'bun:test';
import {
	OPCIONES_POR_OMISION,
	type OpcionesAlGuardar,
	preparar,
} from '../src/tools/al-guardar';

/**
 * Lo que se prueba acá es sobre todo que **apagado no haga nada**. Es la mitad
 * que se rompe callada: una opción que transforma el texto cuando no debería
 * ensucia el archivo de otro, y el síntoma aparece en un `git diff` mucho
 * después.
 */

const con = (cambios: Partial<OpcionesAlGuardar>): OpcionesAlGuardar => ({
	...OPCIONES_POR_OMISION,
	...cambios,
});

describe('por omisión no se toca nada', () => {
	test('las dos opciones vienen apagadas', () => {
		// De esto depende que abrir un archivo ajeno y tocar una línea no deje
		// medio archivo marcado en el diff.
		expect(OPCIONES_POR_OMISION.quitarEspaciosFinales).toBe(false);
		expect(OPCIONES_POR_OMISION.agregarSaltoFinal).toBe(false);
	});

	test('el texto sale igual que entró', () => {
		const texto = 'una   \ndos\t\n\n\ntres';
		const salida = preparar(texto, false, OPCIONES_POR_OMISION);

		expect(salida.texto).toBe(texto);
		expect(salida.terminaConSalto).toBe(false);
	});
});

describe('quitar espacios finales', () => {
	test('saca espacios y tabuladores del final de cada línea', () => {
		const salida = preparar('una   \ndos\t\t\ntres', false, con({ quitarEspaciosFinales: true }));
		expect(salida.texto).toBe('una\ndos\ntres');
	});

	test('no toca los espacios de la sangría ni los del medio', () => {
		const texto = '    sangrado\nuna  dos';
		const salida = preparar(texto, false, con({ quitarEspaciosFinales: true }));
		expect(salida.texto).toBe(texto);
	});

	test('las líneas vacías del final siguen siendo las mismas', () => {
		// La trampa: `/\s+$/g` sin la bandera multilínea colapsaría estas tres
		// líneas vacías en una, borrando dos líneas que nadie pidió borrar.
		const salida = preparar('texto\n\n\n', false, con({ quitarEspaciosFinales: true }));
		expect(salida.texto).toBe('texto\n\n\n');
	});

	test('una línea de sólo espacios queda vacía y no desaparece', () => {
		const salida = preparar('una\n   \ndos', false, con({ quitarEspaciosFinales: true }));
		expect(salida.texto).toBe('una\n\ndos');
	});

	test('un texto vacío sigue vacío', () => {
		expect(preparar('', false, con({ quitarEspaciosFinales: true })).texto).toBe('');
	});
});

describe('agregar el salto final', () => {
	test('un archivo sin salto final lo gana', () => {
		expect(preparar('texto', false, con({ agregarSaltoFinal: true })).terminaConSalto).toBe(true);
	});

	test('uno que ya lo tenía lo conserva', () => {
		expect(preparar('texto', true, con({ agregarSaltoFinal: true })).terminaConSalto).toBe(true);
	});

	test('apagada, nunca lo agrega ni lo quita', () => {
		expect(preparar('texto', false, OPCIONES_POR_OMISION).terminaConSalto).toBe(false);
		expect(preparar('texto', true, OPCIONES_POR_OMISION).terminaConSalto).toBe(true);
	});

	test('no existe la opción de quitarlo', () => {
		// A propósito: quitar el salto final es el cambio destructivo del par
		// —rompe herramientas de línea de órdenes— y no hay ninguna razón para
		// ofrecerlo.
		expect(Object.keys(OPCIONES_POR_OMISION).sort()).toEqual([
			'agregarSaltoFinal',
			'quitarEspaciosFinales',
		]);
	});
});

describe('las dos juntas', () => {
	test('se aplican las dos', () => {
		const salida = preparar('una   \ndos  ', false, {
			quitarEspaciosFinales: true,
			agregarSaltoFinal: true,
		});

		expect(salida.texto).toBe('una\ndos');
		expect(salida.terminaConSalto).toBe(true);
	});
});
