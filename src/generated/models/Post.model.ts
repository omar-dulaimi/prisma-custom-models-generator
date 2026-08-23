import { IsBoolean, IsDate, IsDefined, IsInt, IsOptional, IsString } from "class-validator";
import { User } from ".";

export class Post {
    @IsDefined()
    @IsInt()
    id!: number;

    @IsDefined()
    @IsDate()
    createdAt!: Date;

    @IsDefined()
    @IsDate()
    updatedAt!: Date;

    @IsDefined()
    @IsString()
    title!: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsDefined()
    @IsBoolean()
    published!: boolean;

    @IsDefined()
    @IsInt()
    viewCount!: number;

    @IsOptional()
    author?: User;

    @IsOptional()
    @IsInt()
    authorId?: number;
}
