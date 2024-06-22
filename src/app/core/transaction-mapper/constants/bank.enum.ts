import {registerEnumType} from '@nestjs/graphql';

export enum Bank {
  ABN_AMRO = 'ABN_AMRO',
  REVOLUT = 'REVOLUT',
}

registerEnumType(Bank, {name: 'Bank', description: 'Supported banks'});
