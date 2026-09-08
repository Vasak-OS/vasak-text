/**
 * El puente al disco: los tipos que devuelve Rust y las llamadas que los traen.
 *
 * Los tipos son el reflejo de `src-tauri/src/documento.rs`. Que estén escritos
 * dos veces no es ideal, pero el error que eso puede causar —un campo que se
 * renombra de un lado y no del otro— lo agarra `vue-tsc` en cuanto alguien lo
 * usa, mientras que generar los tipos traería un paso de compilación más para
 * cuatro estructuras.
 *
 * Lo importante está del lado de Rust: acá no hay ninguna decisión sobre el
 * contenido de un archivo. Ver el encabezado de `documento.rs`.
 */

import { invoke } from '@tauri-apps/api/core';

export type FinDeLinea = 'lf' | 'crlf';

/** Con qué se sabe si el archivo cambió en disco. Ver `documento.rs`. */
export interface Huella {
	bytes: number;
	modificado: number;
}

export interface Documento {
	ruta: string;
	/** El texto con `\n`, siempre. La conversión la hace Rust en los bordes. */
	texto: string;
	finDeLinea: FinDeLinea;
	terminaConSalto: boolean;
	huella: Huella;
	/**
	 * Si el archivo traía la marca de orden de bytes de UTF-8.
	 *
	 * No está en el texto —se vería como un carácter invisible al principio de
	 * la primera línea— pero se devuelve al guardar: quitarla son tres bytes que
	 * nadie pidió cambiar.
	 */
	bom: boolean;
	soloLectura: boolean;
}

/**
 * Por qué no se pudo abrir, tal como lo etiqueta `serde` del otro lado.
 *
 * Cada clase existe porque tiene una explicación distinta para quien lo intentó,
 * y la interfaz las traduce por separado: un binario no es una falla del
 * programa y un archivo enorme tampoco.
 */
export type ErrorAlAbrir =
	| { clase: 'no-existe' }
	| { clase: 'es-un-directorio' }
	| { clase: 'demasiado-grande'; detalle: number }
	| { clase: 'binario' }
	| { clase: 'no-es-texto' }
	| { clase: 'sistema'; detalle: string };

export type ErrorAlGuardar =
	| { clase: 'cambio-en-disco'; detalle: Huella }
	| { clase: 'sistema'; detalle: string };

/**
 * Si un rechazo es uno de los errores que Rust describe, y no cualquier otra
 * cosa.
 *
 * Hace falta porque un `invoke` puede fallar antes de llegar al comando —el
 * comando no existe, el argumento no serializa— y ahí el rechazo es una cadena.
 * Sin esta comprobación, `error.clase` daba `undefined` y el mensaje que se
 * mostraba era el genérico, escondiendo un error de programación nuestro.
 */
export function esErrorConocido<T extends { clase: string }>(error: unknown): error is T {
	return typeof error === 'object' && error !== null && 'clase' in error;
}

/** Abre un archivo. Rechaza con un {@link ErrorAlAbrir}. */
export async function abrirDocumento(ruta: string): Promise<Documento> {
	return await invoke<Documento>('abrir_documento', { ruta });
}

/**
 * Guarda y devuelve la huella nueva.
 *
 * `huella` es la de cuando se abrió: si el archivo cambió en disco, Rust
 * **no lo pisa** y rechaza con `cambio-en-disco`. Va en `null` para «guardar
 * como» sobre un archivo que este editor no abrió, que no tiene con qué
 * comparar.
 */
export async function guardarDocumento(
	ruta: string,
	texto: string,
	finDeLinea: FinDeLinea,
	terminaConSalto: boolean,
	bom: boolean,
	huella: Huella | null
): Promise<Huella> {
	return await invoke<Huella>('guardar_documento', {
		ruta,
		texto,
		finDeLinea,
		terminaConSalto,
		bom,
		huella,
	});
}

export async function existe(ruta: string): Promise<boolean> {
	return await invoke<boolean>('existe', { ruta });
}

/** Las rutas con las que se abrió la aplicación. */
export async function rutasDeApertura(): Promise<string[]> {
	return await invoke<string[]>('rutas_de_apertura');
}
