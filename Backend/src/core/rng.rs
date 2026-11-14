//! Generador de números aleatorios con trazabilidad.
//!
//! Implementa Mersenne Twister (MT19937) con **la misma siembra y la misma
//! conversión a `[0, 1)` que `random.Random` de CPython**. Así, para una misma
//! semilla, la versión en Rust produce exactamente la misma secuencia de RND que
//! la versión en Python, lo que permite validar la migración comparando salidas.

const N: usize = 624;
const M: usize = 397;
const MATRIX_A: u32 = 0x9908_b0df;
const UPPER_MASK: u32 = 0x8000_0000;
const LOWER_MASK: u32 = 0x7fff_ffff;

#[derive(Clone)]
pub struct Mt19937 {
    mt: [u32; N],
    idx: usize,
}

impl Mt19937 {
    fn init_genrand(seed: u32) -> Self {
        let mut mt = [0u32; N];
        mt[0] = seed;
        for i in 1..N {
            mt[i] = 1_812_433_253u32
                .wrapping_mul(mt[i - 1] ^ (mt[i - 1] >> 30))
                .wrapping_add(i as u32);
        }
        Self { mt, idx: N }
    }

    /// Equivalente a `random.Random(seed)` de CPython para un entero no negativo:
    /// la semilla se parte en palabras de 32 bits (little-endian) y se usa
    /// `init_by_array`.
    pub fn from_python_seed(seed: u64) -> Self {
        let lo = seed as u32;
        let hi = (seed >> 32) as u32;
        let key: &[u32] = if hi == 0 { &[lo] } else { &[lo, hi] };

        let mut r = Self::init_genrand(19_650_218);
        let mt = &mut r.mt;
        let (mut i, mut j) = (1usize, 0usize);

        for _ in 0..N.max(key.len()) {
            mt[i] = (mt[i] ^ (mt[i - 1] ^ (mt[i - 1] >> 30)).wrapping_mul(1_664_525))
                .wrapping_add(key[j])
                .wrapping_add(j as u32);
            i += 1;
            j += 1;
            if i >= N {
                mt[0] = mt[N - 1];
                i = 1;
            }
            if j >= key.len() {
                j = 0;
            }
        }
        for _ in 0..N - 1 {
            mt[i] = (mt[i] ^ (mt[i - 1] ^ (mt[i - 1] >> 30)).wrapping_mul(1_566_083_941))
                .wrapping_sub(i as u32);
            i += 1;
            if i >= N {
                mt[0] = mt[N - 1];
                i = 1;
            }
        }
        mt[0] = 0x8000_0000;
        r
    }

    fn twist(&mut self) {
        for kk in 0..N {
            let y = (self.mt[kk] & UPPER_MASK) | (self.mt[(kk + 1) % N] & LOWER_MASK);
            let mut v = self.mt[(kk + M) % N] ^ (y >> 1);
            if y & 1 != 0 {
                v ^= MATRIX_A;
            }
            self.mt[kk] = v;
        }
        self.idx = 0;
    }

    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        if self.idx >= N {
            self.twist();
        }
        let mut y = self.mt[self.idx];
        self.idx += 1;
        y ^= y >> 11;
        y ^= (y << 7) & 0x9d2c_5680;
        y ^= (y << 15) & 0xefc6_0000;
        y ^= y >> 18;
        y
    }

    /// Equivalente a `random.random()`: real en `[0, 1)` con 53 bits de precisión.
    #[inline]
    pub fn random(&mut self) -> f64 {
        let a = (self.next_u32() >> 5) as f64;
        let b = (self.next_u32() >> 6) as f64;
        (a * 67_108_864.0 + b) * (1.0 / 9_007_199_254_740_992.0)
    }
}

/// Wrapper que expone el U(0,1) subyacente de cada llamada además del valor
/// transformado. Los métodos devuelven `(rnd, value)`.
#[derive(Clone)]
pub struct TrackedRandom {
    rng: Mt19937,
}

impl TrackedRandom {
    pub fn new(seed: u64) -> Self {
        Self {
            rng: Mt19937::from_python_seed(seed),
        }
    }

    /// Exponencial con media `mean` (transformada inversa: `-ln(U) * mean`).
    #[inline]
    pub fn exponential(&mut self, mean: f64) -> (f64, f64) {
        let u = self.rng.random();
        (u, -u.ln() * mean)
    }

    /// Uniforme en `[a, b]` (transformada inversa: `a + (b - a) * U`).
    #[inline]
    pub fn uniform(&mut self, a: f64, b: f64) -> (f64, f64) {
        let u = self.rng.random();
        (u, a + (b - a) * u)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coincide_con_python_seed_42() {
        // python -c "import random; print(random.Random(42).random())"
        let mut r = Mt19937::from_python_seed(42);
        assert_eq!(r.random(), 0.6394267984578837);
        assert_eq!(r.random(), 0.025010755222666936);
    }

    #[test]
    fn coincide_con_python_seed_0() {
        let mut r = Mt19937::from_python_seed(0);
        assert_eq!(r.random(), 0.8444218515250481);
    }
}
