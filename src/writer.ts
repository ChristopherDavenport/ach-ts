import { ADV } from './constants.js';
import type { File } from './file.js';

const paddingLine = '9'.repeat(94);

export interface WriteOpts {
  lineEnding?: string;
}

interface Stringable {
  string(): string;
}

export class Writer {
  private lines: string[] = [];
  private lineNum = 0;
  lineEnding: string;
  bypassValidation = false;

  constructor(opts?: WriteOpts) {
    this.lineEnding = opts?.lineEnding || '\n';
  }

  write(file: File): string {
    if (!this.bypassValidation) {
      const err = file.validate();
      if (err) throw err;
    }

    this.lines = [];
    this.lineNum = 0;

    this.writeLine(file.header);

    const isADV = file.isADV();

    this.writeBatch(file, isADV);
    this.writeIATBatch(file);

    if (!isADV) {
      this.writeLine(file.control);
    } else {
      this.writeLine(file.advControl);
    }

    // pad the final block
    if (this.lineNum % 10 !== 0) {
      const padCount = 10 - (this.lineNum % 10);
      for (let i = 0; i < padCount; i++) {
        this.lines.push(paddingLine + this.lineEnding);
      }
    }

    return this.lines.join('');
  }

  private writeBatch(file: File, isADV: boolean): void {
    for (const batch of file.batches) {
      this.writeLine(batch.getHeader());

      if (!isADV) {
        for (const entry of batch.getEntries()) {
          this.writeLine(entry);

          if (entry.addenda02) {
            this.writeLine(entry.addenda02);
          }
          for (const addenda05 of entry.addenda05) {
            if (addenda05) {
              this.writeLine(addenda05);
            }
          }
          if (entry.addenda98) {
            this.writeLine(entry.addenda98);
          }
          if (entry.addenda98Refused) {
            this.writeLine(entry.addenda98Refused);
          }
          if (entry.addenda99) {
            this.writeLine(entry.addenda99);
          }
          if (entry.addenda99Dishonored) {
            this.writeLine(entry.addenda99Dishonored);
          }
          if (entry.addenda99Contested) {
            this.writeLine(entry.addenda99Contested);
          }
        }
      } else {
        for (const entry of batch.getADVEntries()) {
          this.writeLine(entry);
          if (entry.addenda99) {
            this.writeLine(entry.addenda99);
          }
        }
      }

      if (batch.getHeader().standardEntryClassCode !== ADV) {
        this.writeLine(batch.getControl());
      } else {
        this.writeLine(batch.getADVControl());
      }
    }
  }

  private writeIATBatch(file: File): void {
    for (const iatBatch of file.iatBatches) {
      this.writeLine(iatBatch.header);

      for (const entry of iatBatch.entries) {
        this.writeLine(entry);

        if (entry.addenda10) {
          this.writeLine(entry.addenda10);
        }
        if (entry.addenda11) {
          this.writeLine(entry.addenda11);
        }
        if (entry.addenda12) {
          this.writeLine(entry.addenda12);
        }
        if (entry.addenda13) {
          this.writeLine(entry.addenda13);
        }
        if (entry.addenda14) {
          this.writeLine(entry.addenda14);
        }
        if (entry.addenda15) {
          this.writeLine(entry.addenda15);
        }
        if (entry.addenda16) {
          this.writeLine(entry.addenda16);
        }
        for (const addenda17 of entry.addenda17) {
          if (addenda17) {
            this.writeLine(addenda17);
          }
        }
        for (const addenda18 of entry.addenda18) {
          if (addenda18) {
            this.writeLine(addenda18);
          }
        }
        if (entry.addenda98) {
          this.writeLine(entry.addenda98);
        }
        if (entry.addenda99) {
          this.writeLine(entry.addenda99);
        }
      }

      this.writeLine(iatBatch.control);
    }
  }

  private writeLine(entry: Stringable): void {
    this.lines.push(entry.string() + this.lineEnding);
    this.lineNum++;
  }
}

export function writeFile(file: File, opts?: WriteOpts): string {
  const w = new Writer(opts);
  return w.write(file);
}
