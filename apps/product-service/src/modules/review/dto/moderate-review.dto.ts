import { IsEnum } from 'class-validator';

export class ModerateReviewDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
}
