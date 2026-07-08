# Kalman Filtering for Financial Time Series

This document is the full mathematical writeup behind the app. It covers two models: a local level model for extracting a smooth price level from noisy closes, and a dynamic regression model that estimates a time-varying hedge ratio for pairs trading. The second is the same technique used in production stat arb research, popularized in Ernie Chan's work on pairs trading.

## 1. State-space formulation

A Kalman filter needs two equations. The state equation describes how a hidden quantity evolves through time. The observation equation describes how the data we can see relates to the hidden quantity we want.

### Local level model

The hidden state is a single number, the underlying price level. It follows a random walk, and each observed close is that level plus measurement noise:

$$
\begin{aligned}
x_t &= x_{t-1} + w_t, \qquad w_t \sim \mathcal{N}(0,\, Q) \\
y_t &= x_t + v_t, \qquad v_t \sim \mathcal{N}(0,\, R)
\end{aligned}
$$

where

- $x_t$ is the hidden price level at time $t$, the quantity we want,
- $y_t$ is the observed close at time $t$, the quantity we get,
- $w_t$ is process noise, the random drift of the true level,
- $v_t$ is observation noise, microstructure and idiosyncratic tick noise,
- $Q$ is the process noise variance,
- $R$ is the observation noise variance.

Treating the close as a noisy measurement of a smoother underlying level is a modeling choice, not a physical fact. It is what turns "smooth this series" into a well-posed estimation problem with an optimal recursive answer.

### Dynamic hedge ratio model

For a pair of correlated assets, the observation is one leg's log price, the regressor is the other leg's log price, and the hidden state is the regression coefficients themselves. Stack the intercept and slope into a state vector that follows a random walk:

$$
\boldsymbol{\theta}_t =
\begin{bmatrix} \alpha_t \\ \beta_t \end{bmatrix},
\qquad
\boldsymbol{\theta}_t = \boldsymbol{\theta}_{t-1} + \mathbf{w}_t,
\qquad
\mathbf{w}_t \sim \mathcal{N}(\mathbf{0},\, \mathbf{Q})
$$

$$
y_t = \mathbf{H}_t \boldsymbol{\theta}_t + v_t
    = \begin{bmatrix} 1 & x_t \end{bmatrix}
      \begin{bmatrix} \alpha_t \\ \beta_t \end{bmatrix} + v_t,
\qquad
v_t \sim \mathcal{N}(0,\, R)
$$

where

- $y_t$ is the log price of the dependent leg at time $t$,
- $x_t$ is the log price of the hedge leg at time $t$,
- $\alpha_t$ is the time-varying intercept of the pair relationship,
- $\beta_t$ is the time-varying hedge ratio, the state we care about,
- $\mathbf{H}_t = \begin{bmatrix} 1 & x_t \end{bmatrix}$ is the observation matrix, different at every step because it contains the regressor price,
- $\mathbf{Q}$ is the $2 \times 2$ process noise covariance of the coefficient random walk,
- $R$ is the variance of the pricing error around the fitted spread.

This is an ordinary linear regression whose coefficients are allowed to move. The time-varying observation matrix is the single detail that makes the filter a regression estimator rather than a smoother. Following Chan, the app parametrizes the process noise as

$$
\mathbf{Q} = \frac{\delta}{1 - \delta}\, \mathbf{I}, \qquad \delta \in (0, 1)
$$

so one scalar $\delta$ controls how fast the coefficients may drift. Small $\delta$ says the hedge ratio is nearly constant. Larger $\delta$ lets it move quickly.

Log prices are used rather than raw prices so that $\beta$ measures the ratio of percentage moves and the spread is scale-free, which matches how the pair would actually be traded.

## 2. Process noise Q and observation noise R

Q and R are the only knobs, and everything about the filter's behavior is the ratio between them. Q says how much the hidden state can plausibly move between two observations. R says how noisy each individual observation is.

The trading interpretation is direct. High R relative to Q means the filter trusts its own model more than the tape. It treats a surprising print as noise, absorbs little of it, and reacts slowly. The estimate is smooth but lags. High Q relative to R means the filter believes the underlying relationship really does move, so it chases the market. It reacts fast and re-fits the hedge ratio aggressively, at the cost of tracking noise it should have ignored.

Neither extreme is right. A pair whose economics are stable, like two mega-cap beverage companies, earns a small Q. A pair spanning a structural break, like one leg getting acquired or shifting its business mix, needs a larger Q or the filter will hedge with a stale beta.

## 3. Prediction step

Before seeing the new observation, project the state and its uncertainty forward. With a random-walk state the transition matrix is the identity, so the best guess for tomorrow is today's estimate, and the uncertainty grows by Q:

$$
\hat{\boldsymbol{\theta}}_{t \mid t-1} = \hat{\boldsymbol{\theta}}_{t-1 \mid t-1},
\qquad
\mathbf{P}_{t \mid t-1} = \mathbf{P}_{t-1 \mid t-1} + \mathbf{Q}
$$

where

- $\hat{\boldsymbol{\theta}}_{t \mid t-1}$ is the state estimate at $t$ given data through $t-1$ (the prior),
- $\hat{\boldsymbol{\theta}}_{t-1 \mid t-1}$ is the state estimate after the previous update (the last posterior),
- $\mathbf{P}_{t \mid t-1}$ is the predicted state covariance, the uncertainty before seeing the new print,
- $\mathbf{P}_{t-1 \mid t-1}$ is the state covariance after the previous update.

In the local level model these are scalars: $\hat{x}_{t \mid t-1} = \hat{x}_{t-1 \mid t-1}$ and $P_{t \mid t-1} = P_{t-1 \mid t-1} + Q$. Uncertainty only ever grows in prediction. Only data shrinks it.

## 4. Update step

The new observation arrives. First compute the innovation, the part of the print the model did not predict, and its variance:

$$
e_t = y_t - \mathbf{H}_t \hat{\boldsymbol{\theta}}_{t \mid t-1},
\qquad
S_t = \mathbf{H}_t \mathbf{P}_{t \mid t-1} \mathbf{H}_t^{\top} + R
$$

where

- $e_t$ is the innovation, the prediction error on the new print,
- $S_t$ is the innovation variance, how surprised the model expected to be.

Then form the Kalman gain and fold the innovation into the estimate:

$$
\mathbf{K}_t = \mathbf{P}_{t \mid t-1} \mathbf{H}_t^{\top} S_t^{-1}
$$

$$
\hat{\boldsymbol{\theta}}_{t \mid t} = \hat{\boldsymbol{\theta}}_{t \mid t-1} + \mathbf{K}_t\, e_t,
\qquad
\mathbf{P}_{t \mid t} = \left( \mathbf{I} - \mathbf{K}_t \mathbf{H}_t \right) \mathbf{P}_{t \mid t-1}
$$

where

- $\mathbf{K}_t$ is the Kalman gain, the fraction of the innovation absorbed into the state,
- $\hat{\boldsymbol{\theta}}_{t \mid t}$ is the updated (posterior) state estimate,
- $\mathbf{P}_{t \mid t}$ is the updated state covariance, always no larger than the prediction,
- $\mathbf{I}$ is the identity matrix.

The gain is the whole story. It is large when the prior is uncertain ($\mathbf{P}$ big) or the data is clean ($R$ small), so the estimate moves toward the print. It is small when the model is confident and the data is noisy, so the print is mostly discounted. In the scalar case the gain reduces to

$$
K_t = \frac{P_{t \mid t-1}}{P_{t \mid t-1} + R}
$$

a number between 0 and 1 that decides how much of each surprise to believe.

The standardized innovation

$$
z_t = \frac{e_t}{\sqrt{S_t}}
$$

doubles as the trading signal in the pairs model. If the model is right, $z_t$ is standard normal white noise. A value beyond about $\pm 2$ says the spread has moved further from the model than noise explains, which is the classic stat arb entry condition: short the rich leg, long the cheap leg, and unwind as $z_t$ reverts toward zero.

## 5. Why this beats a moving average or rolling OLS

A moving average or a rolling regression has a window, and the window is a blunt instrument. Every observation inside it counts fully and equally, every observation outside it counts zero. A 60-day rolling OLS beta jumps when an outlier from 61 days ago falls off the back edge, an artifact with no economic content. The lookback length is a parameter with no principled answer, and the estimator says nothing about its own reliability. It hands you a point estimate and no error bars.

The Kalman filter replaces the window with a probability model. Each new print is weighted by exactly how informative it is under the stated noise assumptions, old information decays smoothly through Q rather than falling off a cliff, and the recursion needs only the previous estimate and covariance, so it runs in constant time per observation and works from the first data point. Most importantly it carries its uncertainty with it. The covariance $\mathbf{P}$ gives a confidence interval around the level or the hedge ratio at every step, and the innovation variance $S_t$ tells you how surprising each print should have been, which is what turns a residual into a z-score you can trade. Under the model assumptions of linear dynamics and Gaussian noise, this is not one option among many. The Kalman filter is the minimum-variance estimator, so any window-based scheme is a special case done worse.
