import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';

/**
 * Every :id in this API is a UUID primary key. A malformed one names a resource that cannot
 * exist, so it answers 404 rather than 400 - and, more importantly, never reaches Postgres,
 * which would reject the cast with a 500 long before the repository could report "not found".
 */
export const ParseIdPipe = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });
