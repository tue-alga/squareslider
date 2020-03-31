import {expect} from "chai";

import {Direction, Ball} from "../src/ball";

describe("Direction", function() {
    it("bounces correctly on the positive diagonal", function() {
        expect(Direction.UP.bouncePositiveDiagonal)
            .to.equal(Direction.RIGHT);
        expect(Direction.RIGHT.bouncePositiveDiagonal)
            .to.equal(Direction.UP);
        expect(Direction.DOWN.bouncePositiveDiagonal)
            .to.equal(Direction.LEFT);
        expect(Direction.LEFT.bouncePositiveDiagonal)
            .to.equal(Direction.DOWN);
    });
});

