import { Injectable } from '@nestjs/common';

export interface Cat {
  id: number;
  name: string;
  age: number;
}

@Injectable()
export class CatsService {
  private cats: Cat[] = [
    { id: 1, name: 'Mia', age: 3 },
    { id: 2, name: 'Felix', age: 5 },
  ];

  findAll(): Cat[] {
    return this.cats;
  }

  findOne(id: number): Cat | undefined {
    return this.cats.find((cat) => cat.id === id);
  }

  create(input: Omit<Cat, 'id'>): Cat {
    const next: Cat = { id: this.cats.length + 1, ...input };
    this.cats.push(next);
    return next;
  }
}
