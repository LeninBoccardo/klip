import type { RegisterCreatorRequest, RegisterCreatorResult } from '@shared/types'

export interface IRegisterCreator {
  execute(input: RegisterCreatorRequest): Promise<RegisterCreatorResult>
}
