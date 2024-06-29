import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {PassportStrategy} from '@nestjs/passport';
import {ExtractJwt, Strategy} from 'passport-jwt';

type JwtPayload = {
  sub: string;
  email: string;
};

/**
 * Extracts the JWT from the Authorization header, decodes it,
 * and validates it using the secret key.
 *
 * Attaches result to the request context as req.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    return {id: payload.sub, email: payload.email};
  }
}
