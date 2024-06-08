import { Injectable } from '@nestjs/common';
import { FileParser } from 'src/file-parsers/file-parser.interface';
import { read, utils } from 'xlsx';
import { CreateTransactionDto } from 'src/transaction/dto/create-transaction.dto';

@Injectable()
export class XlsParser implements FileParser {
  async parse(fileBuffer: Buffer): Promise<CreateTransactionDto[]> {
    const workbook = read(fileBuffer, { type: 'buffer' });

    const worksheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[worksheetName];

    const transactions = utils.sheet_to_json(worksheet, { raw: false });
    console.log(transactions);

    return transactions.map((transaction: any) => {
      const dto = new CreateTransactionDto();
      dto.amount = parseFloat(transaction.amount.replace(',', '.'));
      dto.description = transaction.description.replace(/\s+/g, ' ').trim();
      return dto;
    });
  }
}
