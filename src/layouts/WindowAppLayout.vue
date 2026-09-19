<script lang="ts" setup>
/**
 * La ventana del editor.
 *
 * No dibuja nada propio: el borde, la esquina, el fondo, la barra y los tres
 * botones salen de `WindowFrame`, que es el mismo de todas las ventanas del
 * escritorio. Estaba copiado acá, y ya había derivado de las copias vecinas.
 *
 * De arriba viene además algo que esta copia no tenía: la barra puede ir
 * arriba, abajo, a la izquierda o a la derecha según `window.barPosition` en
 * `~/.config/vasak/vasak.conf`, y las pestañas se acomodan solas —se encogen a
 * un icono cuando está al costado y muestran el nombre al pasar por encima—.
 *
 * Los tres botones se quedan. Cerrar acá no cierra de una: `App.vue` intercepta
 * `onCloseRequested` cuando hay algo sin guardar, así que el botón de la barra
 * dispara la misma pregunta que el gestor de ventanas.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { WindowFrame } from '@vasakgroup/vue-libvasak';

const { t } = useI18n();
</script>

<template>
  <WindowFrame
    :minimize-label="t('ventana.minimizar')"
    :maximize-label="t('ventana.maximizar')"
    :close-label="t('ventana.cerrar')">
    <template v-if="$slots.identidad" #identidad><slot name="identidad" /></template>
    <template v-if="$slots.barra" #barra><slot name="barra" /></template>
    <template v-if="$slots.acciones" #acciones><slot name="acciones" /></template>

    <div class="flex min-h-0 min-w-0 flex-1">
      <slot />
    </div>
  </WindowFrame>
</template>
