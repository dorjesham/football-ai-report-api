import { Global, Module } from '@nestjs/common';
import { UserNotificationService } from './user-notification.service';

@Global()
@Module({
  providers: [UserNotificationService],
  exports: [UserNotificationService],
})
export class UserNotificationsModule {}
