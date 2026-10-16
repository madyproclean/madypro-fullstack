import { Global, Module } from '@nestjs/common';
import { SupervisorScopeService } from './supervisor-scope.service';

@Global()
@Module({
  providers: [SupervisorScopeService],
  exports: [SupervisorScopeService],
})
export class SupervisorScopeModule {}
