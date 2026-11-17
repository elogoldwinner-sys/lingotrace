export interface QRCodeInstance {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
export const QRErrorCorrectLevel: { L: number; M: number; Q: number; H: number };
declare const QRCode: new (typeNumber: number, errorCorrectLevel: number) => QRCodeInstance;
export default QRCode;
