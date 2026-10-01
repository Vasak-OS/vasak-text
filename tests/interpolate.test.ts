import { describe, expect, test } from 'bun:test';
import { interpolate, pluralKey } from '../src/tools/interpolate';

describe('interpolate', () => {
	test('reemplaza los marcadores por su valor', () => {
		expect(interpolate('Hola, {0}', 'Pato')).toBe('Hola, Pato');
		expect(interpolate('{0} de {1}', 3, 10)).toBe('3 de 10');
	});

	test('un valor con $& no altera el texto', () => {
		// Éste es el bug real: con `replace(marcador, valor)` el `$&` se expande
		// al texto encontrado, así que «Rock $& Roll» salía «Rock {0} Roll».
		expect(interpolate('Añadida: {0}', 'Rock $& Roll')).toBe('Añadida: Rock $& Roll');
	});

	test('un valor con $$ conserva los dos signos', () => {
		expect(interpolate('Precio: {0}', 'Cash $$ Money')).toBe('Precio: Cash $$ Money');
	});

	test("un valor con $' no se come el resto del texto", () => {
		// El peor de los tres: `$'` inserta lo que viene después de la
		// coincidencia, así que borraba el final de la frase.
		expect(interpolate("Tema: {0} (fin)", "Don't $' Stop")).toBe("Tema: Don't $' Stop (fin)");
	});

	test('un marcador repetido se reemplaza en todas sus apariciones', () => {
		expect(interpolate('{0} y {0}', 'uno')).toBe('uno y uno');
	});

	test('un valor con un marcador adentro no se vuelve a reemplazar', () => {
		// Un nombre de archivo con llaves es un nombre, no una plantilla.
		expect(interpolate('{0}: {1}', 'informe{1}.txt', 'error')).toBe('informe{1}.txt: error');
		expect(interpolate('{0} y {1}', '{0}', 'dos')).toBe('{0} y dos');
	});

	test('un marcador sin valor queda como está', () => {
		// Mejor que se vea el marcador que un «undefined» en la interfaz.
		expect(interpolate('{0} y {1}', 'uno')).toBe('uno y {1}');
	});

	test('una plantilla sin marcadores pasa intacta', () => {
		expect(interpolate('Sin marcadores', 'ignorado')).toBe('Sin marcadores');
	});
});

describe('pluralKey', () => {
	test('uno usa el singular y el resto el plural', () => {
		expect(pluralKey('inicio.pistas', 1)).toBe('inicio.pistasOne');
		expect(pluralKey('inicio.pistas', 2)).toBe('inicio.pistasOther');
	});

	test('cero usa el plural', () => {
		// En español y en inglés, cero va en plural: «0 pistas».
		expect(pluralKey('inicio.pistas', 0)).toBe('inicio.pistasOther');
	});
});
