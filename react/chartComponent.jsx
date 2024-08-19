import React, { useEffect, useRef, useState } from "react";

/**
 * @param {*} datasets Each dataset should have a label (string), order (number), color (css color), type ('line','bar','stepped'), 
 * data (array<number>), and optionally a clickHandler ((e, data, setId)=>{}).  All datasets must have the same data.length
 * @param {*} labels Array of string labels.  labels.length should match each dataset's data.length
 */
export const ChartComponent = ({
    datasets: newData,
    labels,
    buffer = 40,
    minimumDisplayThreshold = 0.1,
    refreshSpeed = 25,
    width = 600,
    height = 300,
    onClick = null
}) => {
    if (!newData || !newData.length) { throw new Error('Invalid data provided to chart'); }

    const grayLine = 'rgb(155, 155, 155)';
    const barChangeArr = [1, 10, 19, 23, 27, 35, 43, 49, 54, 59, 64, 69, 74, 78, 80, 82, 84, 86, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];

    const [datasets, setDatasets] = useState([
        ...newData.map((x, i) => { if (!x.id) { x.id = i + 1; } return x; })
    ]);

    const [isInitialized, setIsInitialized] = useState(false);
    const canvasRef = useRef(null);
    const offscreenCanvasRef = useRef();

    const clickTargets = useRef([]);
    const setClickTargets = (newTargets) => {
        clickTargets.current = newTargets;
    };
    const [maxVal, setMaxVal] = useState(0);
    const [sectionWidth, setSectionWidth] = useState(0);
    const [verticalIncrement, setVerticalIncrement] = useState(0);
    const [unit, setUnit] = useState(0);
    const [sectionCount, setSectionCount] = useState(0);
    const [labelSpace, setLabelSpace] = useState(0);

    const dataLength = datasets[0].data.length;

    const handleChartClick = (e) => {
        // check chart click targets, sort by highest order, activate handler of first target
        const clicked = clickTargets.current
            .filter(t => withinRect(e.offsetX, e.offsetY, t.NW, t.SE))
            .sort((a, b) => b.order - a.order);
        if (clicked.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            clicked[0].handler(e);
        }
    };
    const withinRect = (x, y, rectNW, rectSE) => {
        return x >= rectNW.x && x <= rectSE.x && y >= rectNW.y && y <= rectSE.y;
    };

    const clear = () => {
        const context = canvasRef.current.getContext('2d');
        context.clearRect(0, 0, width, height);
        const offscreenContext = offscreenCanvasRef.current.getContext('2d');
        offscreenContext.clearRect(0, 0, width, height);
    };

    const drawYAxesOffscreen = () => {
        const offscreenContext = offscreenCanvasRef.current.getContext('2d');
        offscreenContext.font = '12px serif';
        offscreenContext.strokeStyle = grayLine;
        offscreenContext.fillStyle = grayLine;
        for (let i = 0; i < dataLength; i++) {
            offscreenContext.beginPath();
            const x = (sectionWidth * i) + 0.5 + buffer;
            offscreenContext.moveTo(x, buffer);
            offscreenContext.lineTo(x, height - buffer);
            offscreenContext.stroke();
            if (labels && labels.length) {
                const text = labels[i] ?? 'N/A';
                const labelWidth = offscreenContext.measureText(text).width;
                offscreenContext.fillText(text, x - Math.floor(labelWidth / 2), height - (buffer / 3));
            }
        }
    };

    const drawXAxesOffscreen = () => {
        const offscreenContext = offscreenCanvasRef.current.getContext('2d');
        const sectionHeight = Math.floor((height - (buffer * 2)) / sectionCount);
        console.log(`height: ${height}, buffer: ${buffer}, sectionCount: ${sectionCount}`);
        offscreenContext.font = '12px serif';
        offscreenContext.strokeStyle = grayLine;
        offscreenContext.fillStyle = grayLine;
        for (let i = 0; i <= sectionCount; i++) {
            const y = height - (sectionHeight * i) - buffer + 0.5;
            offscreenContext.fillText(Math.floor(i * verticalIncrement), buffer / 4, y);
            offscreenContext.beginPath();
            offscreenContext.moveTo(buffer, y);
            offscreenContext.lineTo(width - buffer, y);
            offscreenContext.stroke();
        }
    };
    /// returns array of clickTargets
    const drawLegendOffscreen = () => {
        const newClickTargets = [];
        datasets
            .sort((a, b) => a.order - b.order)
            .forEach((set, i) => {
                const labelOffset = (labelSpace * i) + buffer;
                newClickTargets.push(drawLegendItemOffscreen(set, labelOffset));
            });
        return newClickTargets;
    };
    /// returns clickTarget
    const drawLegendItemOffscreen = (set, labelOffset) => {
        const offscreenContext = offscreenCanvasRef.current.getContext('2d');
        const squarePaddingLeft = 7;
        offscreenContext.font = '12px serif';
        offscreenContext.strokeStyle = grayLine;
        const fullLabel = set.label + ':';
        const y = buffer - (buffer / 5);
        offscreenContext.fillStyle = 'black';
        offscreenContext.fillText(fullLabel, labelOffset, y);
        const textMeasures = offscreenContext.measureText(fullLabel);
        const labelWidth = textMeasures.width;
        const labelHeight = textMeasures.fontBoundingBoxAscent + textMeasures.fontBoundingBoxDescent;
        offscreenContext.fillStyle = set.hide ? grayLine : set.color;
        const squareSize = Math.floor(buffer / 3);
        offscreenContext.fillRect(labelOffset + labelWidth + squarePaddingLeft, y, squareSize, -squareSize);

        const clickTarget = {
            NW: { x: labelOffset, y: y - labelHeight },
            SE: { x: labelOffset + labelWidth + squareSize + squarePaddingLeft, y },
            datasetId: set.id,
            handler: (e) => { handleLegendClick(e, set.id); },
            order: set.order
        };
        return clickTarget;
    };

    const handleLegendClick = (e, setId) => {
        console.log(`legendClick setId:${setId}`);
        const set = datasets.find(x => x.id == setId);
        setDatasets(prevVals => ([
            ...prevVals.filter(x => x.id != setId),
            {
                ...set,
                hide: !set.hide
            }
        ]));
    };

    const stampGrid = () => {
        canvasRef.current.getContext('2d').drawImage(offscreenCanvasRef.current, 0, 0);
    };
    /// returns array of clickTargets
    const drawData = () => {
        const newClickTargets = [];
        datasets
            .filter(x => !x.hide)
            .sort((a, b) => a.order - b.order)
            .forEach(set => newClickTargets.push(...drawDataSet(set)));
        return newClickTargets;
    };
    /// returns array of clickTargets
    const drawDataSet = (set) => {
        if (!set.color) { throw new Error(`no color given for dataset ${set.label ?? ''}`); }
        let drawFunc = null;
        switch (set.type) {
        case 'line':
            drawFunc = drawLine;
            break;
        case 'stepped':
            drawFunc = drawStepped;
            break;
        case 'bar':
            drawFunc = drawBars;
            break;
        default:
            throw new Error('invalid type given for dataset: ' + set.type);
        }
        return drawFunc(set);
    };
    /// returns array of clickTargets
    const drawLine = (set) => {
        const newClickTargets = [];
        const clickPadding = 9;
        const context = canvasRef.current.getContext('2d');
        context.strokeStyle = set.color;
        context.lineWidth = set.lineWidth ?? 1;
        context.lineJoin = 'round';
        context.beginPath();
        const firstY = height - (set.data[0] * unit) - buffer;
        context.moveTo(buffer, firstY);
        if (set.clickHandler) {
            newClickTargets.push({
                NW: { x: buffer - clickPadding, y: firstY - clickPadding },
                SE: { x: buffer + clickPadding, y: firstY + clickPadding },
                datasetId: set.id,
                handler: (e) => { set.clickHandler(e, set.data[0], set.id); },
                order: set.order
            });
        };
        set.data.slice(1).forEach((d, i) => {
            const x = (sectionWidth * (i + 1)) + 0.5 + buffer;
            const y = height - (d * unit) - buffer;
            context.lineTo(x, y);
            if (set.clickHandler) {
                newClickTargets.push({
                    NW: { x: x - clickPadding, y: y - clickPadding },
                    SE: { x: x + clickPadding, y: y + clickPadding },
                    datasetId: set.id,
                    handler: (e) => { set.clickHandler(e, d, set.id); },
                    order: set.order
                });
            }
        });
        context.stroke();
        context.lineWidth = 1;
        return newClickTargets;
    };
    /// returns array of clickTargets
    const drawStepped = (set) => {
        const newClickTargets = [];
        const context = canvasRef.current.getContext('2d');
        const clickPadding = 9;
        context.strokeStyle = set.color;
        context.lineWidth = set.lineWidth ?? 1;
        context.lineJoin = 'miter';
        context.beginPath();
        const startY = height - (set.data[0] * unit) - buffer;
        context.moveTo(buffer, startY);
        const dataPointsAsSteps = [];
        dataPointsAsSteps.push({ x: buffer, y: startY });
        set.data.slice(1).forEach((val, i) => {
            const y = height - (val * unit) - buffer;
            const prevVal = set.data[i];
            const prevY = height - (prevVal * unit) - buffer;
            const x = (sectionWidth * (i + 1)) + 0.5 + buffer;
            context.lineTo(x, prevY);
            // if val has changed, draw vertical line
            if (prevVal != val) {
                context.lineTo(x, y);
            }
            dataPointsAsSteps.push({ x, y });
        });
        context.stroke();
        const pointWidth = (set.lineWidth ?? 1) / 2;
        dataPointsAsSteps.forEach((point, i) => {
            context.beginPath();
            context.arc(point.x, point.y, pointWidth, 0, 2 * Math.PI);
            context.fillStyle = set.color;
            context.fill();
            context.stroke();
            if (set.clickHandler) {
                newClickTargets.push({
                    NW: { x: point.x - clickPadding, y: point.y - clickPadding },
                    SE: { x: point.x + clickPadding, y: point.y + clickPadding },
                    datasetId: set.id,
                    handler: (e) => { set.clickHandler(e, set.data[i], set.id); },
                    order: set.order
                });
            }
        });
        context.lineWidth = 1;
        return newClickTargets;
    };
    /// returns array of clickTargets
    const drawBars = (set) => {
        const newClickTargets = [];
        const context = canvasRef.current.getContext('2d');
        context.strokeStyle = set.color;
        context.lineWidth = set.lineWidth ?? Math.floor(unit * 0.3);
        set.data.slice(0).forEach((val, i) => {
            context.beginPath();
            const x = (sectionWidth * (i)) + 0.5 + buffer;
            // show a fraction of a bar if value is too small to display
            const y = val < minimumDisplayThreshold
                ? (height - 2 - buffer)
                : (height - (unit * val) - buffer);
            context.moveTo(x, height - buffer);
            context.lineTo(x, y);
            context.stroke();

            if (set.clickHandler) {
                newClickTargets.push({
                    NW: { x: x - (context.lineWidth / 2), y },
                    SE: { x: x + (context.lineWidth / 2), y: height - buffer },
                    datasetId: set.id,
                    handler: (e) => { set.clickHandler(e, val, set.id); },
                    order: set.order
                });
            }
        });
        context.lineWidth = 1;
        return newClickTargets;
    };

    const redraw = () => {
        clear();
        drawYAxesOffscreen();
        drawXAxesOffscreen();
        const legendClickTargets = drawLegendOffscreen();
        stampGrid();
        const dataClickTargets = drawData();
        setClickTargets(legendClickTargets.concat(dataClickTargets));
    };

    useEffect(() => {
        console.log('newData useEffect');
        if (isInitialized) {
            console.log('updating data');
            // update data
            if (newData[0].data.length != dataLength) { throw new Error('Datasets do not have matching lengths in refreshData'); }
            const newFormattedData = newData.map((x, i) => { if (!x.id) { x.id = i; } return x; });
            const newMaxVal = newData.reduce((acc, val) => {
                const highestInSet = val.data.slice().sort().reverse()[0];
                if (highestInSet > acc) { return highestInSet; }
                return acc;
            }, 0);
            if (newMaxVal != maxVal) {
                // recreate chart including grid
                setMaxVal(newMaxVal);

                setSectionWidth(Math.floor((width - (buffer * 2)) / (dataLength - 1)));
                setVerticalIncrement(Math.ceil(Math.min(1, newMaxVal / 10)));
                setUnit(Math.floor((height - (buffer * 2)) / (Math.ceil(newMaxVal))));
                setSectionCount(Math.ceil(Math.min(newMaxVal, 10)));
                setLabelSpace(Math.floor((width - buffer) / newData.length));
                setDatasets(newFormattedData);
            } else {
                // reuse stamp
                const sorted = newFormattedData.sort((a, b) => a.order - b.order);
                const nextFrame = (percentIndex = 0) => {
                    const context = canvasRef.current.getContext('2d');
                    context.clearRect(0, 0, width, height);
                    stampGrid();
                    if (percentIndex >= barChangeArr.length) {
                        sorted.forEach(x => drawDataSet(x));
                        setDatasets(newFormattedData);
                    } else {
                        const percentage = barChangeArr[percentIndex] / 100;
                        sorted.forEach((newVals, i) => {
                            const oldVals = datasets[i];
                            const transitionData = {
                                ...oldVals,
                                data: oldVals.data.map((oldVal, j) => {
                                    const newVal = newVals.data[j];
                                    const diff = Math.abs(oldVal - newVal);
                                    const midVal = (oldVal > newVal) ? (oldVal - (diff * percentage)) : ((diff * percentage) + oldVal);
                                    return midVal;
                                })
                            };
                            drawDataSet(transitionData);
                        });
                        setTimeout(() => { nextFrame(percentIndex + 1); }, refreshSpeed);
                    }
                };
                setTimeout(nextFrame, refreshSpeed);
            }
        }
    }, [newData]);

    useEffect(() => {
        if (!isInitialized && canvasRef.current) {
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = width;
            offscreenCanvas.height = height;

            // need to use maxVal in other calculations, not just to set in maxVal state
            const maxValTemp = datasets.reduce((acc, val) => {
                const highestInSet = val.data.slice().sort().reverse()[0];
                if (highestInSet > acc) { return highestInSet; }
                return acc;
            }, 0);
            setMaxVal(maxValTemp);

            setSectionWidth(Math.floor((width - (buffer * 2)) / (dataLength - 1)));
            setVerticalIncrement(Math.ceil(Math.min(1, maxValTemp / 10)));
            setUnit(Math.floor((height - (buffer * 2)) / (Math.ceil(maxValTemp))));
            setSectionCount(Math.ceil(Math.min(maxValTemp, 10)));
            setLabelSpace(Math.floor((width - buffer) / datasets.length));

            setIsInitialized(true);

            offscreenCanvasRef.current = offscreenCanvas;
        }
    }, [canvasRef.current, newData]);

    useEffect(() => {
        if (isInitialized) {
            console.log('setting click handler');
            canvasRef.current.addEventListener('click', handleChartClick);

            return () => {
                console.log('removing click handler');
                canvasRef.current.removeEventListener('click', handleChartClick);
            };
        }
    }, [isInitialized]);

    useEffect(() => {
        if (isInitialized) {
            redraw();
        }
    }, [datasets, isInitialized]);

    return (
        <canvas width={width} height={height} ref={canvasRef} onClick={onClick}></canvas>
    );
};
