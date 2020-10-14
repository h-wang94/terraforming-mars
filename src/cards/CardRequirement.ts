import { RequirementType } from "./RequirementType";

export class CardRequirement {
    type: RequirementType;
    amount: number;
    isMax?: boolean = false;

    constructor(type: RequirementType, amount: number, isMax: boolean) {
        this.type = type;
        this.amount = amount;
        this.isMax = isMax;
    }

    private toString(): string {
        if (this.type === RequirementType.OXYGEN) {
            return `${this.amount}%`;
        } else if (this.type === RequirementType.TEMPERATURE) {
            return `${this.amount}°`;
        } else {
            return this.amount.toString();
        }
    }

    public getRequirementText(): string {
        const prefix = this.isMax ? "max" : "";
        const parsedAmount = this.toString();

        return `${prefix} ${parsedAmount} ${this.type}`;
    }
}
