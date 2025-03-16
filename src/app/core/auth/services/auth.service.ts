import {Injectable} from '@nestjs/common';
import {Request} from 'express';

import {User} from '@modules/user/user.entity';
import {UserService} from '@modules/user/user.service';

import {SignUpDto} from '../api/signup.dto';
import {EmailVerifierService} from './email-verifier.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly emailVerifierService: EmailVerifierService,
    private readonly userService: UserService,
  ) {}

  async signUp(dto: SignUpDto, request: Request) {
    const user = await this.userService.save(dto);
    await this.emailVerifierService.sendWelcomeEmail(user);
    await this.logIn(user, request);
    return user;
  }

  async logOut(request: Request) {
    await new Promise<void>((resolve) => {
      request.logOut({keepSessionInfo: false}, () => {
        resolve();
      });
      request.session.destroy(() => {
        resolve();
      });
    });
    return {message: 'User logged out.'};
  }

  async logIn(user: User, request: Request) {
    await new Promise<void>((resolve) => {
      request.logIn(user, () => {
        resolve();
      });
    });
    return {message: 'User logged in.'};
  }
}
