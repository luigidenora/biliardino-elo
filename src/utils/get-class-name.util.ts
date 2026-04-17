/**
 * Get the class name for a given class number.
 *
 * @param classNumber - The class number (0-5).
 * @returns The class name.
 */
export function getClassName(classNumber: number): string {
  const classNames: Record<number, string> = {
    0: 'Sogliola',
    1: 'Spigola',
    2: 'Tonno',
    3: 'Barracuda',
    4: 'Squalo',
    5: 'Megalodonte'
  };
  return classNames[classNumber] || 'Sconosciuto';
}
