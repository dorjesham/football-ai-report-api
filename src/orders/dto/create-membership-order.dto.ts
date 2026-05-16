import { IsIn } from 'class-validator';

export type MembershipPlan = 'month' | 'quarter' | 'year';

export class CreateMembershipOrderDto {
  @IsIn(['month', 'quarter', 'year'])
  plan!: MembershipPlan;
}
