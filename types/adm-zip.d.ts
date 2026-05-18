declare module "adm-zip" {
  export default class AdmZip {
    constructor(buf?: Buffer | string);
    extractAllTo(path: string, overwrite?: boolean): void;
    getEntries(): { entryName: string; isDirectory: boolean }[];
  }
}
