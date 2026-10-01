import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_SAVE_OPTIONS,
	type SaveOptions,
	prepareForSave,
} from '../src/tools/save-options';

/**
 * Lo que se prueba acá es sobre todo que **apagado no haga nada**. Es la mitad
 * que se rompe callada: una opción que transforma el texto cuando no debería
 * ensucia el archivo de otro, y el síntoma aparece en un `git diff` mucho
 * después.
 */

const con = (cambios: Partial<SaveOptions>): SaveOptions => ({
	...DEFAULT_SAVE_OPTIONS,
	...cambios,
});

describe('por omisión no se toca nada', () => {
	test('las dos opciones vienen apagadas', () => {
		// De esto depende que abrir un archivo ajeno y tocar una línea no deje
		// medio archivo marcado en el diff.
		expect(DEFAULT_SAVE_OPTIONS.trimTrailingWhitespace).toBe(false);
		expect(DEFAULT_SAVE_OPTIONS.insertFinalNewline).toBe(false);
	});

	test('el texto sale igual que entró', () => {
		const texto = 'una   \ndos\t\n\n\ntres';
		const output = prepareForSave(texto, false, DEFAULT_SAVE_OPTIONS);

		expect(output.text).toBe(texto);
		expect(output.endsWithNewline).toBe(false);
	});
});

describe('quitar espacios finales', () => {
	test('saca espacios y tabuladores del final de cada línea', () => {
		const output = prepareForSave('una   \ndos\t\t\ntres', false, con({ trimTrailingWhitespace: true }));
		expect(output.text).toBe('una\ndos\ntres');
	});

	test('no toca los espacios de la sangría ni los del medio', () => {
		const texto = '    sangrado\nuna  dos';
		const output = prepareForSave(texto, false, con({ trimTrailingWhitespace: true }));
		expect(output.text).toBe(texto);
	});

	test('las líneas vacías del final siguen siendo las mismas', () => {
		// La trampa: `/\s+$/g` sin la bandera multilínea colapsaría estas tres
		// líneas vacías en una, borrando dos líneas que nadie pidió borrar.
		const output = prepareForSave('texto\n\n\n', false, con({ trimTrailingWhitespace: true }));
		expect(output.text).toBe('texto\n\n\n');
	});

	test('una línea de sólo espacios queda vacía y no desaparece', () => {
		const output = prepareForSave('una\n   \ndos', false, con({ trimTrailingWhitespace: true }));
		expect(output.text).toBe('una\n\ndos');
	});

	test('un texto vacío sigue vacío', () => {
		expect(prepareForSave('', false, con({ trimTrailingWhitespace: true })).text).toBe('');
	});
});

describe('agregar el salto final', () => {
	test('un archivo sin salto final lo gana', () => {
		expect(prepareForSave('texto', false, con({ insertFinalNewline: true })).endsWithNewline).toBe(true);
	});

	test('uno que ya lo tenía lo conserva', () => {
		expect(prepareForSave('texto', true, con({ insertFinalNewline: true })).endsWithNewline).toBe(true);
	});

	test('apagada, nunca lo agrega ni lo quita', () => {
		expect(prepareForSave('texto', false, DEFAULT_SAVE_OPTIONS).endsWithNewline).toBe(false);
		expect(prepareForSave('texto', true, DEFAULT_SAVE_OPTIONS).endsWithNewline).toBe(true);
	});

	test('no existe la opción de quitarlo', () => {
		// A propósito: quitar el salto final es el cambio destructivo del par
		// —rompe herramientas de línea de órdenes— y no hay ninguna razón para
		// ofrecerlo.
		expect(Object.keys(DEFAULT_SAVE_OPTIONS).sort()).toEqual([
			'insertFinalNewline',
			'trimTrailingWhitespace',
		]);
	});
});

describe('las dos juntas', () => {
	test('se aplican las dos', () => {
		const output = prepareForSave('una   \ndos  ', false, {
			trimTrailingWhitespace: true,
			insertFinalNewline: true,
		});

		expect(output.text).toBe('una\ndos');
		expect(output.endsWithNewline).toBe(true);
	});
});
