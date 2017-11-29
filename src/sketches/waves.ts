import * as $ from "jquery";
import { parse } from "query-string";
import * as THREE from "three";

import { lerp, map } from "../math";
import { ISketch, SketchAudioContext } from "../sketch";

const LINE_SEGMENT_LENGTH = (window.screen.width > 1024) ? 11 : 22;

const HeightMap = {
    width: 1200,
    height: 1200,
    frame: 0,
    /**
     * How wavy the heightmap is, from [0..1]. 0 means not wavy at all (only bulbous); 1.0 means only wavy.
     */
    getWaviness(frame: number) {
        return (1 + Math.sin(frame / 100)) / 2;
    },
    evaluate(x: number, y: number) {
        const length2 = x * x + y * y;
        // z1 creates the bulb shape at the center (using a logistic function)
        const z1 = 23000 / (1 + Math.exp(-length2 / 10000));
        // z2 creates the radial wave shapes from the center
        const z2 = 600 * Math.cos(length2 / 25000 + HeightMap.frame / 25);
        // z3 is a smaller radial wave shape that is centered towards the mouse
        const z3 = 100 * Math.cos(Math.sqrt(Math.pow(x - HeightMap.width, 2) + Math.pow(y - HeightMap.height, 2)) / 20 + HeightMap.frame / 25);

        return lerp(z1, z2, HeightMap.getWaviness(HeightMap.frame)) + z3;
    },
    gradient(x: number, y: number) {
        const fnxy = HeightMap.evaluate(x, y);
        const epsilon = 1e-4;
        const ddx = (HeightMap.evaluate(x + epsilon, y) - fnxy) / epsilon;
        const ddy = (HeightMap.evaluate(x, y + epsilon) - fnxy) / epsilon;

        return [ddx, ddy];
    },
};

function permutedLine(ox: number, oy: number, nx: number, ny: number, geometryIn?: THREE.Geometry) {
    const distance = Math.sqrt(Math.pow(ox - nx, 2) + Math.pow(oy - ny, 2));
    // about 11 units per line segment
    const steps = distance / LINE_SEGMENT_LENGTH;
    let geometry: THREE.Geometry;
    if (geometryIn == null) {
        geometry = new THREE.Geometry();
        for ( let t = 0; t <= steps; t++) {
            geometry.vertices.push(new THREE.Vector3());
        }
    } else {
        geometry = geometryIn;
    }

    function permutePoint(x: number, y: number, idx: number) {
        const grad = HeightMap.gradient(x, y);
        geometry.vertices[idx].set(x + grad[0], y + grad[1], 0);
    }

    for ( let t = 0; t <= steps; t++) {
        const percentage = t / steps;
        permutePoint(ox + (nx - ox) * percentage,
                        oy + (ny - oy) * percentage, t);
    }
    return geometry;
}

interface PositionedLine extends THREE.Line {
    x: number;
    y: number;
    inlineOffsetX: number;
    inlineOffsetY: number;
}

// offsetX and offsetY define the vector that the line draws on (the inline direction). the direction that
// the vector offsets to repeat itself is the traversal direction. The two are always orthogonal.
class LineStrip {
    public inlineAngle: number;
    public dx: number;
    public dy: number;
    public gridOffsetX: number;
    public gridOffsetY: number;
    public object: THREE.Object3D;
    public width: number;
    public height: number;

    constructor(width: number, height: number, offsetX: number, offsetY: number, public gridSize: number) {
        this.inlineAngle = Math.atan(offsetY / offsetX);
        this.dx = 1;
        this.dy = 1;

        // the specific offset of the entire line for this frame
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;

        this.object = new THREE.Object3D();

        this.resize(width, height);
    }

    public update() {
        this.gridOffsetX = ((this.gridOffsetX + this.dx) % this.gridSize + this.gridSize) % this.gridSize;
        this.gridOffsetY = ((this.gridOffsetY + this.dy) % this.gridSize + this.gridSize) % this.gridSize;
        // console.log(this.gridOffsetX, this.gridOffsetY);
        this.object.children.forEach((lineMesh: PositionedLine) => {
            const { x, y, inlineOffsetX, inlineOffsetY } = lineMesh;
            const geometry = lineMesh.geometry as THREE.Geometry;
            permutedLine(
                x + this.gridOffsetX - inlineOffsetX,
                y + this.gridOffsetY - inlineOffsetY,
                x + this.gridOffsetX + inlineOffsetX,
                y + this.gridOffsetY + inlineOffsetY,
                geometry,
            );
            geometry.verticesNeedUpdate = true;
        });
    }

    public resize(width: number, height: number) {
        this.width = width;
        this.height = height;

        // delete old lines
        this.object.remove.apply(this.object, this.object.children);

        const diagLength = Math.sqrt(this.width * this.width + this.height * this.height) + 2 * this.gridSize;
        // create and add a Line mesh to the lines array
        const createAndAddLine = (x: number, y: number) => {
            const inlineOffsetX = Math.cos(this.inlineAngle) * diagLength / 2;
            const inlineOffsetY = Math.sin(this.inlineAngle) * diagLength / 2;
            const geometry = permutedLine(
                x - inlineOffsetX,
                y - inlineOffsetY,
                x + inlineOffsetX,
                y + inlineOffsetY,
            );
            const lineMesh = new THREE.Line(geometry, lineMaterial) as PositionedLine;
            lineMesh.frustumCulled = false;
            this.object.add(lineMesh);
            lineMesh.x = x;
            lineMesh.y = y;
            lineMesh.inlineOffsetX = inlineOffsetX;
            lineMesh.inlineOffsetY = inlineOffsetY;
        };

        createAndAddLine(0, 0);

        const traversalAngle = this.inlineAngle + Math.PI / 2;
        for (let d = this.gridSize; d < diagLength / 2; d += this.gridSize) {
            createAndAddLine(+Math.cos(traversalAngle) * d,
                +Math.sin(traversalAngle) * d);
            createAndAddLine(-Math.cos(traversalAngle) * d,
                -Math.sin(traversalAngle) * d);
        }
    }
}

function createAudioGroup(audioContext: SketchAudioContext) {
    const backgroundAudio = $("<audio autoplay loop>")
                            .append('<source src="/assets/sketches/waves/waves_background.mp3" type="audio/mp3">')
                            .append('<source src="/assets/sketches/waves/waves_background.ogg" type="audio/ogg">') as JQuery<HTMLMediaElement>;

    const sourceNode = audioContext.createMediaElementSource(backgroundAudio[0]);
    $("body").append(backgroundAudio);

    const backgroundAudioGain = audioContext.createGain();
    backgroundAudioGain.gain.value = 0.0;
    sourceNode.connect(backgroundAudioGain);
    backgroundAudioGain.connect(audioContext.gain);

    const noise = (() => {
        const node = audioContext.createBufferSource()
        , buffer = audioContext.createBuffer(1, audioContext.sampleRate * 5, audioContext.sampleRate)
        , data = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        node.buffer = buffer;
        node.loop = true;
        node.start(0);
        return node;
    })();

    const biquadFilter = (() => {
        const node = audioContext.createScriptProcessor(undefined, 1, 1);
        let a0 = 1;
        let b1 = 0;

        function setBiquadParameters(frame: number) {
            a0 = getDarkness(frame + 10) * 0.8;
            b1 = map(Math.pow(HeightMap.getWaviness(frame), 2), 0, 1, -0.92, -0.27);
            backgroundAudioGain.gain.value = map(getDarkness(frame + 10), 0, 1, 1, 0.8);
        }

        node.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);
            const framesPerSecond = isTimeFast ? 60 * 4 : 60;
            for (let n = 0; n < e.inputBuffer.length; n++) {
                if (n % 512 === 0) {
                    const frameOffset = n / audioContext.sampleRate * framesPerSecond;
                    setBiquadParameters(HeightMap.frame + frameOffset);
                }
                const x = input[n];
                const y1 = output[n - 1] || 0;

                output[n] = a0 * x - b1 * y1;
            }
        };
        return node;
    })();
    noise.connect(biquadFilter);

    const biquadFilterGain = audioContext.createGain();
    biquadFilterGain.gain.value = 0.01;
    biquadFilter.connect(biquadFilterGain);

    biquadFilterGain.connect(audioContext.gain);
    return {
        biquadFilter,
    };
}

let audioGroup: any;
const lineStrips: LineStrip[] = [];
let isTimeFast = false;

// threejs stuff
let camera: THREE.OrthographicCamera;
const lineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.03 });
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;

function init(_renderer: THREE.WebGLRenderer, audioContext: SketchAudioContext) {
    audioGroup = createAudioGroup(audioContext);
    renderer = _renderer;
    renderer.autoClearColor = false;

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(0, 1, 0, 1, 1, 1000);
    camera.position.z = 500;

    // cheap mobile detection
    const gridSize = (window.screen.width > 1024) ? 50 : 100;
    // lineStrips.push(new LineStrip(HeightMap.width, HeightMap.height, 1, 1, gridSize));
    lineStrips.push(new LineStrip(HeightMap.width, HeightMap.height, 1, -1, gridSize));
    lineStrips.push(new LineStrip(HeightMap.width, HeightMap.height, 0, 1, gridSize));
    // lineStrips.push(new LineStrip(HeightMap.width, HeightMap.height, 1, 0, gridSize));

    lineStrips.forEach((lineStrip) => {
        scene.add(lineStrip.object);
    });

    resize(_renderer.domElement.width, _renderer.domElement.height);
    // set a default x/y for the mouse so the wave travels to the bottom-right by default
}

function animate() {
    const opacityChangeFactor = 0.1;
    if (isTimeFast) {
        lineMaterial.opacity = lineMaterial.opacity * (1 - opacityChangeFactor) + 0.23 * opacityChangeFactor;
        HeightMap.frame += 4;
    } else {
        lineMaterial.opacity = lineMaterial.opacity * (1 - opacityChangeFactor) + 0.03 * opacityChangeFactor;
        HeightMap.frame += 1;
    }

    if (HeightMap.frame % 1000 < 500) {
        lineMaterial.color.set("rgb(50, 12, 12)");
    } else {
        lineMaterial.color.set("rgb(252, 247, 243)");
    }

    const scale = map(Math.sin(HeightMap.frame / 550), -1, 1, 1, 0.8);
    camera.scale.set(scale, scale, 1);
    lineStrips.forEach((lineStrip) => {
        lineStrip.update();
    });
    renderer.render(scene, camera);
}

// return a number from [0..1] indicating in general how dark the image is; 1.0 means very dark, while 0.0 means very light
function getDarkness(frame: number) {
    if (frame % 1000 < 500) {
        return map(frame % 500, 0, 500, 0, 1);
    } else {
        return map(frame % 500, 0, 500, 1, 0);
    }
}

function mousemove(event: JQuery.Event) {
    setVelocityFromMouseEvent(event);
}

function mousedown(event: JQuery.Event) {
    if (event.which === 1) {
        isTimeFast = true;
        setVelocityFromMouseEvent(event);
    }
}

function mouseup(event: JQuery.Event) {
    if (event.which === 1) {
        isTimeFast = false;
        setVelocityFromMouseEvent(event);
    }
}

function setVelocityFromMouseEvent(event: JQuery.Event) {
    const mouseX = event.offsetX == null ? (event.originalEvent as MouseEvent).layerX : event.offsetX;
    const mouseY = event.offsetY == null ? (event.originalEvent as MouseEvent).layerY : event.offsetY;
    setVelocityFromCanvasCoordinates(mouseX, mouseY);
}

function resize(width: number, height: number) {
    if (width > height) {
        HeightMap.height = 1200;
        HeightMap.width = 1200 * width / height;
    } else {
        HeightMap.width = 1200;
        HeightMap.height = 1200 * height / width;
    }
    camera.left = -HeightMap.width / 2;
    camera.top = -HeightMap.height / 2;
    camera.bottom = HeightMap.height / 2;
    camera.right = HeightMap.width / 2;
    camera.updateProjectionMatrix();

    renderer.setClearColor(0xfcfcfc, 1);
    renderer.clear();

    // draw black again
    HeightMap.frame = 0;

    lineStrips.forEach((lineStrip) => {
        lineStrip.resize(HeightMap.width, HeightMap.height);
    });
}

function touchstart(event: JQuery.Event) {
    // prevent emulated mouse events from occuring
    event.preventDefault();

    isTimeFast = true;
    setVelocityFromTouchEvent(event);
}

function touchmove(event: JQuery.Event) {
    setVelocityFromTouchEvent(event);
}

function touchend(event: JQuery.Event) {
    isTimeFast = false;
}

function setVelocityFromTouchEvent(event: JQuery.Event) {
    const canvasOffset = $(renderer.domElement).offset()!;
    const touch = (event.originalEvent as TouchEvent).touches[0];
    const touchX = touch.pageX - canvasOffset.left;
    const touchY = touch.pageY - canvasOffset.top;

    setVelocityFromCanvasCoordinates(touchX, touchY);
}

function setVelocityFromCanvasCoordinates(canvasX: number, canvasY: number) {
    const dx = map(canvasX, 0, renderer.domElement.width, -1, 1) * 2.20;
    const dy = map(canvasY, 0, renderer.domElement.height, -1, 1) * 2.20;
    lineStrips.forEach((lineStrip) => {
        lineStrip.dx = dx;
        lineStrip.dy = dy;
    });
}

export const Waves: ISketch = {
    id: "waves",
    init,
    animate,
    mousemove,
    mousedown,
    mouseup,
    resize,
    touchstart,
    touchmove,
    touchend,
};