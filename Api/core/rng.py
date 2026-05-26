"""
Generador de números aleatorios con trazabilidad.

Permite capturar el valor uniforme U(0,1) base que se usó para generar cada
variable aleatoria (exponencial, uniforme), lo cual es necesario para registrar
el RND en el vector de estado del CSV.
"""

from __future__ import annotations

import math
import random


class TrackedRandom:
    """
    Wrapper sobre `random.Random` que expone el U(0,1) subyacente de cada llamada,
    además del valor transformado final.

    Los métodos devuelven tuplas `(rnd, value)` donde:
      - `rnd`   es el número uniforme [0, 1) extraído del generador base.
      - `value` es el valor resultante de aplicar la distribución deseada.
    """

    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)

    def exponential(self, mean: float) -> tuple[float, float]:
        """
        Distribución exponencial con media `mean` (parámetro = 1/mean).

        Usa la transformada inversa: value = -ln(U) * mean
        """
        u = self._rng.random()
        value = -math.log(u) * mean
        return u, value

    def uniform(self, a: float, b: float) -> tuple[float, float]:
        """
        Distribución uniforme en [a, b].

        Usa la transformada inversa: value = a + (b - a) * U
        """
        u = self._rng.random()
        value = a + (b - a) * u
        return u, value
