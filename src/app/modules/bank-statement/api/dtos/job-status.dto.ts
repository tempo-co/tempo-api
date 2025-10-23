import {JobType} from 'bullmq';

export class JobStatusDto {
	id: string;
	progress: number;
	status: JobType;
	failedReason?: string;
}
