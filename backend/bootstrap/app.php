<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'role' => EnsureRole::class,
            'permission' => EnsurePermission::class,
        ]);

        // There is no web login route; API requests never redirect (they get
        // JSON 401 from shouldRenderJsonWhen), web guests fall back to '/'.
        $middleware->redirectGuestsTo(function ($request) {
            return $request->is('api/*') ? null : url('/');
        });

        // Bearer-token API: stateless (no session/CSRF for api/*).
        // Do NOT call statefulApi() — it treats localhost:3000 as stateful
        // and makes VerifyCsrfToken return 419 on /api/login|register.
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Always render JSON errors for API routes (validation, auth, 404...).
        $exceptions->shouldRenderJsonWhen(
            fn ($request) => $request->is('api/*') || $request->expectsJson()
        );
    })->create();
