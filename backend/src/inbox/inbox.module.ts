import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [ApprovalsModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
