import { Global, Module } from '@nestjs/common';
import { FileProcessorService } from './file-processor.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService, FileProcessorService],
  exports: [StorageService, FileProcessorService],
})
export class StorageModule {}
